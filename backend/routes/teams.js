const express = require('express');
const axios = require('axios');
const router = express.Router();

const FD_BASE = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

const AF_BASE = 'https://v3.football.api-sports.io';
const AF_KEY  = process.env.FOOTBALL_API_KEY;

function afHeaders() {
  return { 'x-apisports-key': AF_KEY };
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── GET /api/teams/epl ────────────────────────────────────────────────────────
router.get('/epl', async (req, res) => {
  try {
    const { data } = await axios.get(`${FD_BASE}/competitions/PL/teams`, { headers: FD_HEADERS });
    const teams = (data.teams || []).map(t => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      logo: t.crest,
      venue: t.venue,
    }));
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/teams/:teamId/matches ────────────────────────────────────────────
router.get('/:teamId/matches', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { data } = await axios.get(`${FD_BASE}/teams/${teamId}/matches`, {
      headers: FD_HEADERS,
      params: { season: 2024, limit: 50 },
    });

    const matches = (data.matches || [])
      .filter(m => m.competition && m.competition.code === 'PL')
      .map(m => ({
        id: m.id,
        matchday: m.matchday,
        kickoff: m.utcDate,
        status: m.status,
        homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest },
        awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest },
        score: {
          home: m.score?.fullTime?.home ?? null,
          away: m.score?.fullTime?.away ?? null,
        },
        goals: (m.goals || []).map(g => ({
          minute:    g.minute,
          extraTime: g.injuryTime || null,
          team:      g.team?.name || '',
          teamId:    g.team?.id || null,
          scorer:    g.scorer?.name || 'Unknown',
          assist:    g.assist?.name || null,
          type:      g.type || 'REGULAR',
        })),
      }));

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/teams/:teamId/match/:matchId ─────────────────────────────────────
// matchId = football-data.org numeric match ID
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    const { matchId, teamId } = req.params;

    // ── Step 1: Basic info from football-data.org ─────────────────────────
    const { data: m } = await axios.get(`${FD_BASE}/matches/${matchId}`, { headers: FD_HEADERS });

    const result = {
      id:        m.id,
      matchday:  m.matchday,
      kickoff:   m.utcDate,
      status:    m.status,
      venue:     m.venue || '',
      referee:   m.referees?.[0]?.name || '',
      competition: m.competition?.name || 'Premier League',
      homeTeam: {
        id:        m.homeTeam.id,
        name:      m.homeTeam.name,
        logo:      m.homeTeam.crest,
        formation: null,
        lineup:    null,
      },
      awayTeam: {
        id:        m.awayTeam.id,
        name:      m.awayTeam.name,
        logo:      m.awayTeam.crest,
        formation: null,
        lineup:    null,
      },
      score: {
        home:     m.score?.fullTime?.home ?? null,
        away:     m.score?.fullTime?.away ?? null,
        halfTime: {
          home: m.score?.halfTime?.home ?? null,
          away: m.score?.halfTime?.away ?? null,
        },
      },
      // football-data.org free tier returns goals for finished matches
      goals: (m.goals || []).map(g => ({
        minute:    g.minute,
        extraTime: g.injuryTime || null,
        team:      g.team?.name || '',
        teamId:    g.team?.id   || null,
        scorer:    g.scorer?.name || 'Unknown',
        assist:    g.assist?.name || null,
        type:      g.type || 'REGULAR',
      })),
      bookings: (m.bookings || []).map(b => ({
        minute: b.minute,
        team:   b.team?.name   || '',
        player: b.player?.name || '',
        card:   b.card,
      })),
      substitutions: (m.substitutions || []).map(s => ({
        minute:    s.minute,
        team:      s.team?.name      || '',
        playerOut: s.playerOut?.name || '',
        playerIn:  s.playerIn?.name  || '',
      })),
    };

    // ── Step 2: Enrich with api-football.com (goals, lineups, cards, subs) ─
    if (AF_KEY && m.status === 'FINISHED') {
      try {
        const kickoffDate = new Date(m.utcDate).toISOString().slice(0, 10);
        console.log(`AF enrichment: searching fixtures for ${kickoffDate}`);
        await wait(200);

        // Search by date in EPL (league 39)
        const { data: afData } = await axios.get(`${AF_BASE}/fixtures`, {
          headers: afHeaders(),
          params: { league: 39, season: 2024, date: kickoffDate },
        });

        const fixtures = afData.response || [];
        console.log(`AF found ${fixtures.length} fixtures on ${kickoffDate}`);

        // Find matching fixture by team name similarity
        const homeFirst = m.homeTeam.name.split(' ')[0].toLowerCase();
        const awayFirst = m.awayTeam.name.split(' ')[0].toLowerCase();

        let fixture = null;
        for (const f of fixtures) {
          const fh = f.teams.home.name.toLowerCase();
          const fa = f.teams.away.name.toLowerCase();
          const homeMatch = fh.includes(homeFirst) || homeFirst.includes(fh.split(' ')[0]);
          const awayMatch = fa.includes(awayFirst) || awayFirst.includes(fa.split(' ')[0]);
          if (homeMatch && awayMatch) { fixture = f; break; }
        }

        if (!fixture) {
          console.log(`AF: no fixture found matching ${m.homeTeam.name} vs ${m.awayTeam.name}`);
        } else {
          const fid = fixture.fixture.id;
          console.log(`AF fixture ID: ${fid}`);
          await wait(200);

          // Fetch events (goals, cards, subs)
          const { data: evData } = await axios.get(`${AF_BASE}/fixtures/events`, {
            headers: afHeaders(),
            params: { fixture: fid },
          });

          const events = evData.response || [];
          const afGoals = [], afCards = [], afSubs = [];

          for (const ev of events) {
            const min   = ev.time?.elapsed ?? null;
            const extra = ev.time?.extra   ?? null;
            const team  = ev.team?.name    || '';
            const player = ev.player?.name || '';
            const assist = ev.assist?.name || null;

            if (ev.type === 'Goal') {
              afGoals.push({
                minute:    min,
                extraTime: extra,
                team,
                teamId:    ev.team?.id || null,
                scorer:    player,
                assist:    assist,
                type:      ev.detail === 'Own Goal' ? 'OWN_GOAL'
                         : ev.detail === 'Penalty'  ? 'PENALTY'
                         : 'REGULAR',
              });
            } else if (ev.type === 'Card') {
              afCards.push({
                minute: min,
                team,
                player,
                card: ev.detail === 'Red Card' ? 'RED_CARD' : 'YELLOW_CARD',
              });
            } else if (ev.type === 'subst') {
              afSubs.push({
                minute:    min,
                team,
                playerOut: player,
                playerIn:  assist || '',
              });
            }
          }

          if (afGoals.length > 0) result.goals         = afGoals;
          if (afCards.length > 0) result.bookings      = afCards;
          if (afSubs.length  > 0) result.substitutions = afSubs;

          console.log(`AF events: ${afGoals.length} goals, ${afCards.length} cards, ${afSubs.length} subs`);

          await wait(200);

          // Fetch lineups
          const { data: luData } = await axios.get(`${AF_BASE}/fixtures/lineups`, {
            headers: afHeaders(),
            params: { fixture: fid },
          });

          const lineups = luData.response || [];
          console.log(`AF lineups: ${lineups.length} teams`);

          for (const lu of lineups) {
            const luName = lu.team?.name?.toLowerCase() || '';
            const isHome = luName.includes(homeFirst) || homeFirst.includes(luName.split(' ')[0]);

            const built = {
              formation: lu.formation || null,
              startXI: (lu.startXI || []).map(p => ({
                name:        p.player?.name   || '',
                position:    p.player?.pos    || '',
                shirtNumber: p.player?.number ?? null,
              })),
              bench: (lu.substitutes || []).map(p => ({
                name:        p.player?.name   || '',
                position:    p.player?.pos    || '',
                shirtNumber: p.player?.number ?? null,
              })),
            };

            if (isHome) {
              result.homeTeam.formation = lu.formation || null;
              result.homeTeam.lineup    = built;
            } else {
              result.awayTeam.formation = lu.formation || null;
              result.awayTeam.lineup    = built;
            }
          }
        }
      } catch (afErr) {
        // Log but don't fail — return basic data
        console.error('AF enrichment failed:', afErr.response?.data || afErr.message);
      }
    } else if (!AF_KEY) {
      console.log('No FOOTBALL_API_KEY — skipping AF enrichment');
    }

    res.json({ match: result });

  } catch (err) {
    console.error('Match detail error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;
