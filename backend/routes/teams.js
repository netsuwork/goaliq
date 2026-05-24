const express = require('express');
const axios   = require('axios');
const Match   = require('../models/Match');
const router  = express.Router();

const FD_BASE    = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

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
// Read directly from MongoDB — no external API call needed
router.get('/:teamId/matches', async (req, res) => {
  try {
    const teamId = parseInt(req.params.teamId);

    // Find all EPL matches where this team played
    const matches = await Match.find({
      league: 'epl',
      $or: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    }).sort({ kickoff: 1 }).limit(60);

    const result = matches.map(m => ({
      id:       m.externalId,
      _id:      m._id,
      matchday: m.matchday,
      kickoff:  m.kickoff,
      status:   m.status,
      homeTeam: {
        id:   m.homeTeamId,
        name: m.homeTeam,
        logo: m.homeTeamLogo,
      },
      awayTeam: {
        id:   m.awayTeamId,
        name: m.awayTeam,
        logo: m.awayTeamLogo,
      },
      score: {
        home: m.score?.home ?? null,
        away: m.score?.away ?? null,
      },
      goals: (m.goals || []).map(g => ({
        minute:    g.minute,
        extraTime: g.extraTime || null,
        team:      g.team,
        teamId:    g.teamId || null,
        scorer:    g.scorer,
        assist:    g.assist || null,
        type:      g.type || 'REGULAR',
      })),
    }));

    res.json({ matches: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/teams/:teamId/match/:matchId ─────────────────────────────────────
// matchId = externalId (football-data.org numeric ID)
// Read from MongoDB first, fall back to FD API for basic info
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    const { matchId, teamId } = req.params;

    // Try MongoDB first
    const dbMatch = await Match.findOne({ externalId: String(matchId) });

    if (dbMatch) {
      console.log('Serving match', matchId, 'from MongoDB — goals:', (dbMatch.goals||[]).length);
      return res.json({
        match: {
          id:          dbMatch.externalId,
          matchday:    dbMatch.matchday,
          kickoff:     dbMatch.kickoff,
          status:      dbMatch.status === 'finished' ? 'FINISHED'
                     : dbMatch.status === 'live'     ? 'IN_PLAY'
                     : 'SCHEDULED',
          venue:       dbMatch.venue    || '',
          referee:     dbMatch.referee  || '',
          competition: dbMatch.leagueName || 'Premier League',
          homeTeam: {
            id:        dbMatch.homeTeamId,
            name:      dbMatch.homeTeam,
            logo:      dbMatch.homeTeamLogo,
            formation: null,
            lineup:    null,
          },
          awayTeam: {
            id:        dbMatch.awayTeamId,
            name:      dbMatch.awayTeam,
            logo:      dbMatch.awayTeamLogo,
            formation: null,
            lineup:    null,
          },
          score: {
            home:     dbMatch.score?.home ?? null,
            away:     dbMatch.score?.away ?? null,
            halfTime: { home: null, away: null },
          },
          goals: (dbMatch.goals || []).map(g => ({
            minute:    g.minute,
            extraTime: g.extraTime || null,
            team:      g.team,
            teamId:    g.teamId || null,
            scorer:    g.scorer,
            assist:    g.assist || null,
            type:      g.type || 'REGULAR',
          })),
          bookings: (dbMatch.bookings || []).map(b => ({
            minute: b.minute,
            team:   b.team   || '',
            player: b.player || '',
            card:   b.card,
          })),
          substitutions: (dbMatch.substitutions || []).map(s => ({
            minute:    s.minute,
            team:      s.team      || '',
            playerOut: s.playerOut || '',
            playerIn:  s.playerIn  || '',
          })),
        }
      });
    }

    // Fallback — fetch basic info from football-data.org (no goals on free tier)
    console.log('Match', matchId, 'not in MongoDB — fetching from FD');
    const { data: m } = await axios.get(FD_BASE + '/matches/' + matchId,
      { headers: FD_HEADERS, timeout: 8000 });

    res.json({
      match: {
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
      }
    });

  } catch (err) {
    console.error('Match detail error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;
