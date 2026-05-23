const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const FD_BASE    = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

const AF_BASE = 'https://v3.football.api-sports.io';

function afHead() {
  return { 'x-apisports-key': process.env.FOOTBALL_API_KEY };
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── GET /api/teams/epl ────────────────────────────────────────────────────────
router.get('/epl', async (req, res) => {
  try {
    const { data } = await axios.get(FD_BASE + '/competitions/PL/teams',
      { headers: FD_HEADERS, timeout: 8000 });
    res.json({
      teams: (data.teams || []).map(t => ({
        id: t.id, name: t.name, shortName: t.shortName,
        logo: t.crest, venue: t.venue,
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/teams/:teamId/matches ────────────────────────────────────────────
router.get('/:teamId/matches', async (req, res) => {
  try {
    const { data } = await axios.get(FD_BASE + '/teams/' + req.params.teamId + '/matches', {
      headers: FD_HEADERS,
      params: { season: 2024, limit: 50 },
      timeout: 8000,
    });

    const matches = (data.matches || [])
      .filter(m => m.competition && m.competition.code === 'PL')
      .map(m => ({
        id:       m.id,
        matchday: m.matchday,
        kickoff:  m.utcDate,
        status:   m.status,
        homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest },
        awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest },
        score: {
          home: m.score?.fullTime?.home ?? null,
          away: m.score?.fullTime?.away ?? null,
        },
        goals: (m.goals || []).map(g => ({
          minute:    g.minute,
          extraTime: g.injuryTime || null,
          team:      g.team?.name  || '',
          teamId:    g.team?.id    || null,
          scorer:    g.scorer?.name || 'Unknown',
          assist:    g.assist?.name || null,
          type:      g.type || 'REGULAR',
        })),
      }));

    res.json({ matches });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/teams/:teamId/match/:matchId ─────────────────────────────────────
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    const { matchId, teamId } = req.params;
    const afKey = process.env.FOOTBALL_API_KEY;

    console.log('Match detail request — matchId:', matchId, '| AF key present:', !!afKey);

    // ── Step 1: Basic data from football-data.org ─────────────────────────
    const { data: m } = await axios.get(FD_BASE + '/matches/' + matchId,
      { headers: FD_HEADERS, timeout: 8000 });

    const result = {
      id:          m.id,
      matchday:    m.matchday,
      kickoff:     m.utcDate,
      status:      m.status,
      venue:       m.venue || '',
      referee:     m.referees?.[0]?.name || '',
      competition: m.competition?.name || 'Premier League',
      homeTeam: {
        id: m.homeTeam.id, name: m.homeTeam.name,
        logo: m.homeTeam.crest, formation: null, lineup: null,
      },
      awayTeam: {
        id: m.awayTeam.id, name: m.awayTeam.name,
        logo: m.awayTeam.crest, formation: null, lineup: null,
      },
      score: {
        home:     m.score?.fullTime?.home ?? null,
        away:     m.score?.fullTime?.away ?? null,
        halfTime: {
          home: m.score?.halfTime?.home ?? null,
          away: m.score?.halfTime?.away ?? null,
        },
      },
      goals:         [],
      bookings:      [],
      substitutions: [],
    };

    // ── Step 2: Try to get goals from football-data.org competition matches ─
    // The /matches/:id endpoint doesn't return scorers on free tier
    // but /competitions/PL/matches?matchday=X does
    try {
      const { data: mdData } = await axios.get(
        FD_BASE + '/competitions/PL/matches',
        {
          headers: FD_HEADERS,
          params: { matchday: m.matchday, season: 2024 },
          timeout: 8000,
        }
      );
      const found = (mdData.matches || []).find(x => x.id === m.id);
      if (found && found.goals && found.goals.length > 0) {
        result.goals = found.goals.map(g => ({
          minute:    g.minute,
          extraTime: g.injuryTime || null,
          team:      g.team?.name  || '',
          teamId:    g.team?.id    || null,
          scorer:    g.scorer?.name || 'Unknown',
          assist:    g.assist?.name || null,
          type:      g.type || 'REGULAR',
        }));
        result.bookings = (found.bookings || []).map(b => ({
          minute: b.minute, team: b.team?.name || '',
          player: b.player?.name || '', card: b.card,
        }));
        result.substitutions = (found.substitutions || []).map(s => ({
          minute:    s.minute,      team:      s.team?.name      || '',
          playerOut: s.playerOut?.name || '', playerIn: s.playerIn?.name || '',
        }));
        console.log('FD matchday goals found:', result.goals.length);
      } else {
        console.log('FD matchday returned no goals for this match');
      }
    } catch (fdErr) {
      console.log('FD matchday fetch failed:', fdErr.message);
    }

    // ── Step 3: Enrich with api-football.com ─────────────────────────────
    if (afKey && m.status === 'FINISHED') {
      try {
        const kickoffDate = new Date(m.utcDate).toISOString().slice(0, 10);
        console.log('AF: searching EPL fixtures for', kickoffDate);

        const { data: afData } = await axios.get(AF_BASE + '/fixtures', {
          headers: afHead(),
          params: { league: 39, season: 2024, date: kickoffDate },
          timeout: 7000,
        });

        const fixtures = afData.response || [];
        console.log('AF: found', fixtures.length, 'fixtures on', kickoffDate);

        const homeFirst = m.homeTeam.name.split(' ')[0].toLowerCase();
        const awayFirst = m.awayTeam.name.split(' ')[0].toLowerCase();

        let fixture = null;
        for (const f of fixtures) {
          const fh = f.teams.home.name.toLowerCase();
          const fa = f.teams.away.name.toLowerCase();
          if (
            (fh.includes(homeFirst) || homeFirst.includes(fh.split(' ')[0])) &&
            (fa.includes(awayFirst) || awayFirst.includes(fa.split(' ')[0]))
          ) { fixture = f; break; }
        }

        if (!fixture) {
          console.log('AF: no fixture matched for', m.homeTeam.name, 'vs', m.awayTeam.name);
        } else {
          const fid = fixture.fixture.id;
          console.log('AF: matched fixture ID', fid);
          await wait(300);

          // Events
          const { data: evData } = await axios.get(AF_BASE + '/fixtures/events', {
            headers: afHead(), params: { fixture: fid }, timeout: 7000,
          });

          const afGoals = [], afCards = [], afSubs = [];
          for (const ev of (evData.response || [])) {
            const min  = ev.time?.elapsed ?? null;
            const ext  = ev.time?.extra   ?? null;
            const team = ev.team?.name    || '';
            const pl   = ev.player?.name  || '';
            const ast  = ev.assist?.name  || null;

            if (ev.type === 'Goal') {
              afGoals.push({
                minute: min, extraTime: ext, team,
                teamId: ev.team?.id || null,
                scorer: pl, assist: ast,
                type: ev.detail === 'Own Goal' ? 'OWN_GOAL'
                    : ev.detail === 'Penalty'  ? 'PENALTY' : 'REGULAR',
              });
            } else if (ev.type === 'Card') {
              afCards.push({
                minute: min, team, player: pl,
                card: ev.detail === 'Red Card' ? 'RED_CARD' : 'YELLOW_CARD',
              });
            } else if (ev.type === 'subst') {
              afSubs.push({ minute: min, team, playerOut: pl, playerIn: ast || '' });
            }
          }

          console.log('AF events:', afGoals.length, 'goals,', afCards.length, 'cards,', afSubs.length, 'subs');

          if (afGoals.length > 0) result.goals         = afGoals;
          if (afCards.length > 0) result.bookings      = afCards;
          if (afSubs.length  > 0) result.substitutions = afSubs;

          await wait(300);

          // Lineups
          const { data: luData } = await axios.get(AF_BASE + '/fixtures/lineups', {
            headers: afHead(), params: { fixture: fid }, timeout: 7000,
          });

          const lineups = luData.response || [];
          console.log('AF lineups:', lineups.length, 'teams');

          for (const lu of lineups) {
            const luName = lu.team?.name?.toLowerCase() || '';
            const isHome = luName.includes(homeFirst) || homeFirst.includes(luName.split(' ')[0]);
            const built  = {
              formation: lu.formation || null,
              startXI: (lu.startXI || []).map(p => ({
                name: p.player?.name || '', position: p.player?.pos || '',
                shirtNumber: p.player?.number ?? null,
              })),
              bench: (lu.substitutes || []).map(p => ({
                name: p.player?.name || '', position: p.player?.pos || '',
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
        console.error('AF enrichment failed:', afErr.response?.data || afErr.message);
      }
    } else {
      if (!afKey) console.log('No FOOTBALL_API_KEY set — skipping AF enrichment');
    }

    console.log('Final result — goals:', result.goals.length, '| bookings:', result.bookings.length, '| lineups:', !!result.homeTeam.lineup);
    res.json({ match: result });

  } catch (err) {
    console.error('Match detail error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

router.get('/debug/:matchId', async (req, res) => {
  const matchId = req.params.matchId;
  const afKey   = process.env.FOOTBALL_API_KEY;
  const fdKey   = process.env.FOOTBALL_DATA_KEY;
  const result  = { matchId, fdKey: !!fdKey, afKey: !!afKey, steps: [] };

  // Step 1: FD single match
  try {
    const { data } = await axios.get(FD_BASE + '/matches/' + matchId,
      { headers: FD_HEADERS, timeout: 8000 });
    result.steps.push({
      step: 'FD /matches/:id',
      status: 'ok',
      goals: (data.goals||[]).length,
      bookings: (data.bookings||[]).length,
      kickoff: data.utcDate,
      matchday: data.matchday,
      homeTeam: data.homeTeam?.name,
      awayTeam: data.awayTeam?.name,
    });
    const matchday = data.matchday;
    const kickoff  = data.utcDate;

    // Step 2: FD competition matchday
    try {
      const { data: md } = await axios.get(
        FD_BASE + '/competitions/PL/matches',
        { headers: FD_HEADERS, params: { matchday, season: 2024 }, timeout: 8000 }
      );
      const found = (md.matches||[]).find(x => x.id === Number(matchId));
      result.steps.push({
        step: 'FD /competitions/PL/matches?matchday=' + matchday,
        status: 'ok',
        totalMatches: (md.matches||[]).length,
        foundThisMatch: !!found,
        goals: found ? (found.goals||[]).length : 'n/a',
        bookings: found ? (found.bookings||[]).length : 'n/a',
      });
    } catch(e) {
      result.steps.push({ step: 'FD matchday', status: 'error', error: e.response?.data || e.message });
    }

    // Step 3: AF fixtures by date
    if (afKey) {
      const date = new Date(kickoff).toISOString().slice(0,10);
      try {
        const { data: af } = await axios.get(AF_BASE + '/fixtures', {
          headers: { 'x-apisports-key': afKey },
          params: { league: 39, season: 2024, date },
          timeout: 7000,
        });
        const fixtures = af.response || [];
        result.steps.push({
          step: 'AF /fixtures?date=' + date,
          status: 'ok',
          errors: af.errors,
          results: af.results,
          fixturesFound: fixtures.length,
          fixtures: fixtures.map(f => f.teams.home.name + ' vs ' + f.teams.away.name + ' (id:' + f.fixture.id + ')'),
        });

        // Step 4: AF events if fixture found
        const homeFirst = data.homeTeam.name.split(' ')[0].toLowerCase();
        const awayFirst = data.awayTeam.name.split(' ')[0].toLowerCase();
        const fixture = fixtures.find(f => {
          const fh = f.teams.home.name.toLowerCase();
          const fa = f.teams.away.name.toLowerCase();
          return (fh.includes(homeFirst)||homeFirst.includes(fh.split(' ')[0])) &&
                 (fa.includes(awayFirst)||awayFirst.includes(fa.split(' ')[0]));
        });

        if (fixture) {
          const fid = fixture.fixture.id;
          try {
            const { data: ev } = await axios.get(AF_BASE + '/fixtures/events', {
              headers: { 'x-apisports-key': afKey },
              params: { fixture: fid }, timeout: 7000,
            });
            const goals = (ev.response||[]).filter(e => e.type==='Goal');
            const cards = (ev.response||[]).filter(e => e.type==='Card');
            const subs  = (ev.response||[]).filter(e => e.type==='subst');
            result.steps.push({
              step: 'AF /fixtures/events?fixture=' + fid,
              status: 'ok',
              errors: ev.errors,
              goals: goals.length,
              cards: cards.length,
              subs:  subs.length,
              firstGoal: goals[0] || null,
            });
          } catch(e) {
            result.steps.push({ step: 'AF events', status: 'error', error: e.response?.data || e.message });
          }
        } else {
          result.steps.push({ step: 'AF fixture match', status: 'not_found', homeFirst, awayFirst });
        }
      } catch(e) {
        result.steps.push({ step: 'AF fixtures', status: 'error', error: e.response?.data || e.message });
      }
    } else {
      result.steps.push({ step: 'AF', status: 'skipped', reason: 'No FOOTBALL_API_KEY' });
    }

  } catch(e) {
    result.steps.push({ step: 'FD /matches/:id', status: 'error', error: e.response?.data || e.message });
  }

  res.json(result);
});

module.exports = router;
