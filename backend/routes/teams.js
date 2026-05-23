const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');
const router = express.Router();

const BASE = 'https://api.football-data.org/v4';
const HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// Simple in-memory cache to respect 10 req/min free tier limit
const _cache = new Map();
function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { _cache.delete(key); return null; }
  return hit.data;
}
function cacheSet(key, data, ttlMs) {
  _cache.set(key, { data, expires: Date.now() + ttlMs });
}

// ─── GET /api/teams/epl ───────────────────────────────────────────────────────
// Returns all 20 PL clubs for 2024/25 season
router.get('/epl', async (req, res) => {
  const KEY = 'epl-teams';
  const cached = cacheGet(KEY);
  if (cached) return res.json(cached);

  try {
    const { data } = await axios.get(`${FD_BASE}/competitions/PL/teams`, {
      headers: getHeaders(),
      params: { season: 2024 },
    });

    const teams = (data.teams || []).map(t => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName || t.tla || t.name,
      tla: t.tla,
      logo: t.crest,                        // football-data.org v4 uses "crest"
      venue: t.venue || null,
    }));

    const result = { teams };
    cacheSet(KEY, result, 24 * 60 * 60 * 1000); // 24hr — clubs don't change
    res.json(result);
  } catch (err) {
    console.error('[teams/epl]', err.response?.status, err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// ─── GET /api/teams/:teamId/matches ──────────────────────────────────────────
// All 2024/25 PL matches for one club, with goal scorers & assists
router.get('/:teamId/matches', async (req, res) => {
  const teamId = parseInt(req.params.teamId);
  if (!teamId) return res.status(400).json({ error: 'Invalid team ID' });

  const KEY = `team-matches-${teamId}`;
  const cached = cacheGet(KEY);
  if (cached) return res.json(cached);

  try {
    const { data } = await axios.get(`${FD_BASE}/teams/${teamId}/matches`, {
      headers: getHeaders(),
      params: {
        competitions: 'PL',
        season: 2024,
        limit: 40,
      },
    });

    const matches = (data.matches || []).map(m => {
      const ft = m.score?.fullTime || {};
      const ht = m.score?.halfTime || {};

      // Map goals — football-data.org v4 includes goals array on team match list
      const goals = (m.goals || []).map(g => ({
        minute: g.minute,
        extraTime: g.extraTime || null,
        type: g.type,                        // REGULAR, PENALTY, OWN_GOAL
        team: g.team?.name || null,
        teamId: g.team?.id || null,
        scorer: g.scorer?.name || null,
        assist: g.assist?.name || null,
      }));

      return {
        id: m.id,
        kickoff: m.utcDate,
        status: m.status,                    // FINISHED, SCHEDULED, TIMED, IN_PLAY
        matchday: m.matchday,
        competition: m.competition?.name || 'Premier League',
        homeTeam: {
          id: m.homeTeam?.id,
          name: m.homeTeam?.name,
          shortName: m.homeTeam?.shortName || m.homeTeam?.tla || m.homeTeam?.name,
          logo: m.homeTeam?.crest,
        },
        awayTeam: {
          id: m.awayTeam?.id,
          name: m.awayTeam?.name,
          shortName: m.awayTeam?.shortName || m.awayTeam?.tla || m.awayTeam?.name,
          logo: m.awayTeam?.crest,
        },
        score: {
          home: ft.home ?? null,
          away: ft.away ?? null,
          halfTime: { home: ht.home ?? null, away: ht.away ?? null },
        },
        goals,
      };
    });

    const result = { matches };
    // Cache 1hr for in-season, 6hr once all finished
    const allFinished = matches.every(m => m.status === 'FINISHED');
    cacheSet(KEY, result, allFinished ? 6 * 60 * 60 * 1000 : 60 * 60 * 1000);
    res.json(result);
  } catch (err) {
    console.error('[teams/:id/matches]', err.response?.status, err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/match/:matchId
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    // First try our own database
    const Match = require('../models/Match');
    const dbMatch = await Match.findOne({ externalId: String(matchId) });

    if (dbMatch) {
      return res.json({
        match: {
          id: dbMatch.externalId,
          matchday: dbMatch.matchday,
          kickoff: dbMatch.kickoff,
          status: dbMatch.status === 'finished' ? 'FINISHED' : dbMatch.status,
          venue: dbMatch.venue || '',
          referee: dbMatch.referee || '',
          homeTeam: {
            id: dbMatch.homeTeamId,
            name: dbMatch.homeTeam,
            logo: dbMatch.homeTeamLogo,
            formation: null,
            lineup: null,
          },
          awayTeam: {
            id: dbMatch.awayTeamId,
            name: dbMatch.awayTeam,
            logo: dbMatch.awayTeamLogo,
            formation: null,
            lineup: null,
          },
          score: {
            home: dbMatch.score?.home ?? null,
            away: dbMatch.score?.away ?? null,
            halfTime: { home: null, away: null },
          },
          goals: dbMatch.goals || [],
          bookings: [],
          substitutions: [],
        }
      });
    }

    // Fallback to external API
    const { data } = await axios.get(`${BASE}/matches/${matchId}`, { headers: HEADERS });
    const m = data;

    const goals = (m.goals || []).map(g => ({
      minute: g.minute,
      extraTime: g.injuryTime || null,
      team: g.team?.name,
      teamId: g.team?.id,
      scorer: g.scorer?.name || 'Unknown',
      assist: g.assist?.name || null,
      type: g.type || 'REGULAR',
    }));

    res.json({
      match: {
        id: m.id,
        matchday: m.matchday,
        kickoff: m.utcDate,
        status: m.status,
        venue: m.venue || '',
        referee: m.referees?.[0]?.name || '',
        homeTeam: {
          id: m.homeTeam.id,
          name: m.homeTeam.name,
          logo: m.homeTeam.crest,
          formation: m.homeTeam.formation || null,
          lineup: null,
        },
        awayTeam: {
          id: m.awayTeam.id,
          name: m.awayTeam.name,
          logo: m.awayTeam.crest,
          formation: m.awayTeam.formation || null,
          lineup: null,
        },
        score: {
          home: m.score?.fullTime?.home ?? null,
          away: m.score?.fullTime?.away ?? null,
          halfTime: {
            home: m.score?.halfTime?.home ?? null,
            away: m.score?.halfTime?.away ?? null,
          },
        },
        goals,
        bookings: (m.bookings || []).map(b => ({
          minute: b.minute,
          team: b.team?.name,
          player: b.player?.name,
          card: b.card,
        })),
        substitutions: (m.substitutions || []).map(s => ({
          minute: s.minute,
          team: s.team?.name,
          playerOut: s.playerOut?.name,
          playerIn: s.playerIn?.name,
        })),
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
