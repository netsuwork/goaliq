const express = require('express');
const axios   = require('axios');
const Match   = require('../models/Match');
const router  = express.Router();

const FD_BASE    = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// ── GET /api/teams/epl ────────────────────────────────────────────────────────
router.get('/epl', async (req, res) => {
  try {
    const { data } = await axios.get(`${FD_BASE}/competitions/PL/teams`,
      { headers: FD_HEADERS, params: { season: 2025 }, timeout: 8000 });
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
    const teamId = parseInt(req.params.teamId);

    const matches = await Match.find({
      league: 'epl',
      season: '2025',
      $or: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    }).sort({ kickoff: 1 }).limit(60);

    res.json({
      matches: matches.map(m => ({
        id:       m.externalId,
        _id:      m._id,
        matchday: m.matchday,
        kickoff:  m.kickoff,
        status:   m.status,
        homeTeam: { id: m.homeTeamId, name: m.homeTeam, logo: m.homeTeamLogo },
        awayTeam: { id: m.awayTeamId, name: m.awayTeam, logo: m.awayTeamLogo },
        score:    { home: m.score?.home ?? null, away: m.score?.away ?? null },
        goals:    m.goals || [],
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /api/teams/:teamId/match/:matchId ─────────────────────────────────────
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    // Read from MongoDB
    const m = await Match.findOne({ externalId: String(matchId) });

    if (m) {
      return res.json({
        match: {
          id:          m.externalId,
          matchday:    m.matchday,
          kickoff:     m.kickoff,
          status:      m.status === 'finished' ? 'FINISHED'
                     : m.status === 'live'     ? 'IN_PLAY' : 'SCHEDULED',
          venue:       m.venue    || '',
          referee:     m.referee  || '',
          competition: m.leagueName || 'Premier League',
          homeTeam: {
            id:        m.homeTeamId,
            name:      m.homeTeam,
            logo:      m.homeTeamLogo,
            formation: m.homeFormation || null,
            lineup:    m.homeLineup    || null,
          },
          awayTeam: {
            id:        m.awayTeamId,
            name:      m.awayTeam,
            logo:      m.awayTeamLogo,
            formation: m.awayFormation || null,
            lineup:    m.awayLineup    || null,
          },
          score: {
            home:     m.score?.home ?? null,
            away:     m.score?.away ?? null,
            halfTime: {
              home: m.halfTimeScore?.home ?? null,
              away: m.halfTimeScore?.away ?? null,
            },
          },
          goals:         m.goals         || [],
          bookings:      m.bookings      || [],
          substitutions: m.substitutions || [],
        }
      });
    }

    // Fallback to FD API for basic info
    const { data: fd } = await axios.get(`${FD_BASE}/matches/${matchId}`,
      { headers: FD_HEADERS, timeout: 8000 });

    res.json({
      match: {
        id:          fd.id,
        matchday:    fd.matchday,
        kickoff:     fd.utcDate,
        status:      fd.status,
        venue:       fd.venue || '',
        referee:     fd.referees?.[0]?.name || '',
        competition: fd.competition?.name || 'Premier League',
        homeTeam: { id: fd.homeTeam.id, name: fd.homeTeam.name, logo: fd.homeTeam.crest, formation: null, lineup: null },
        awayTeam: { id: fd.awayTeam.id, name: fd.awayTeam.name, logo: fd.awayTeam.crest, formation: null, lineup: null },
        score: {
          home: fd.score?.fullTime?.home ?? null,
          away: fd.score?.fullTime?.away ?? null,
          halfTime: { home: fd.score?.halfTime?.home ?? null, away: fd.score?.halfTime?.away ?? null },
        },
        goals: [], bookings: [], substitutions: [],
      }
    });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;
