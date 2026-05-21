const express = require('express');
const axios = require('axios');
const router = express.Router();

const FD_BASE = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// Cache to avoid hammering the API (rate limit: 10 req/min on free tier)
const cache = new Map();
function cacheGet(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > item.ttl) { cache.delete(key); return null; }
  return item.data;
}
function cacheSet(key, data, ttlMs) {
  cache.set(key, { data, ts: Date.now(), ttl: ttlMs });
}

// GET /api/teams/pl-clubs — return 20 PL clubs with standings
router.get('/pl-clubs', async (req, res) => {
  const cacheKey = 'pl-clubs';
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    // 2024-25 Premier League = competition code PL
    const { data } = await axios.get(`${FD_BASE}/competitions/PL/standings`, {
      headers: FD_HEADERS,
      params: { season: 2024 },
    });

    const table = data.standings?.find(s => s.type === 'TOTAL')?.table || [];

    const teams = table.map(row => ({
      id: row.team.id,
      name: row.team.name,
      short: row.team.shortName || row.team.tla,
      pos: row.position,
      played: row.playedGames,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      gf: row.goalsFor,
      ga: row.goalsAgainst,
      pts: row.points,
      champion: row.position === 1,
      relegated: row.position >= 18,
    }));

    const result = { teams };
    cacheSet(cacheKey, result, 6 * 60 * 60 * 1000); // 6hr cache
    res.json(result);
  } catch (err) {
    console.error('pl-clubs error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/season-matches — all 2024-25 PL matches for a team
router.get('/:teamId/season-matches', async (req, res) => {
  const teamId = parseInt(req.params.teamId);
  if (!teamId) return res.status(400).json({ error: 'Invalid team ID' });

  const cacheKey = `team-matches-${teamId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    // Fetch all matches for this team in 2024-25 PL season
    const { data } = await axios.get(`${FD_BASE}/teams/${teamId}/matches`, {
      headers: FD_HEADERS,
      params: {
        competitions: 'PL',
        season: 2024,
        limit: 40,
      },
    });

    const matches = (data.matches || []).map(m => ({
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      matchday: m.matchday,
      competition: { name: m.competition?.name },
      homeTeam: {
        id: m.homeTeam?.id,
        name: m.homeTeam?.name,
        shortName: m.homeTeam?.shortName || m.homeTeam?.tla,
      },
      awayTeam: {
        id: m.awayTeam?.id,
        name: m.awayTeam?.name,
        shortName: m.awayTeam?.shortName || m.awayTeam?.tla,
      },
      score: m.score,
      goals: (m.goals || []).map(g => ({
        minute: g.minute,
        extraTime: g.extraTime,
        type: g.type,
        team: { id: g.team?.id },
        scorer: { id: g.scorer?.id, name: g.scorer?.name },
        assist: g.assist ? { id: g.assist?.id, name: g.assist?.name } : null,
      })),
    }));

    const result = { matches };
    cacheSet(cacheKey, result, 30 * 60 * 1000); // 30min cache
    res.json(result);
  } catch (err) {
    console.error('season-matches error:', err.message, err.response?.data);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/match/:matchId — full match detail with lineups, goals, cards, subs
router.get('/match/:matchId', async (req, res) => {
  const matchId = parseInt(req.params.matchId);
  if (!matchId) return res.status(400).json({ error: 'Invalid match ID' });

  const cacheKey = `match-detail-${matchId}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { data } = await axios.get(`${FD_BASE}/matches/${matchId}`, {
      headers: FD_HEADERS,
    });

    const m = data;

    const match = {
      id: m.id,
      utcDate: m.utcDate,
      status: m.status,
      matchday: m.matchday,
      competition: { name: m.competition?.name },
      homeTeam: {
        id: m.homeTeam?.id,
        name: m.homeTeam?.name,
        shortName: m.homeTeam?.shortName || m.homeTeam?.tla,
        formation: m.homeTeam?.formation || null,
        lineup: (m.homeTeam?.lineup || []).map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          shirtNumber: p.shirtNumber,
        })),
        bench: (m.homeTeam?.bench || []).map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          shirtNumber: p.shirtNumber,
        })),
      },
      awayTeam: {
        id: m.awayTeam?.id,
        name: m.awayTeam?.name,
        shortName: m.awayTeam?.shortName || m.awayTeam?.tla,
        formation: m.awayTeam?.formation || null,
        lineup: (m.awayTeam?.lineup || []).map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          shirtNumber: p.shirtNumber,
        })),
        bench: (m.awayTeam?.bench || []).map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          shirtNumber: p.shirtNumber,
        })),
      },
      score: m.score,
      goals: (m.goals || []).map(g => ({
        minute: g.minute,
        extraTime: g.extraTime,
        type: g.type,
        team: { id: g.team?.id },
        scorer: { id: g.scorer?.id, name: g.scorer?.name },
        assist: g.assist ? { id: g.assist?.id, name: g.assist?.name } : null,
      })),
      bookings: (m.bookings || []).map(b => ({
        minute: b.minute,
        team: { id: b.team?.id },
        player: { id: b.player?.id, name: b.player?.name },
        card: b.card,
      })),
      substitutions: (m.substitutions || []).map(s => ({
        minute: s.minute,
        team: { id: s.team?.id },
        playerOut: { id: s.playerOut?.id, name: s.playerOut?.name },
        playerIn: { id: s.playerIn?.id, name: s.playerIn?.name },
      })),
    };

    const result = { match };
    // Cache finished matches for 24hrs, recent/live for 5min
    const ttl = m.status === 'FINISHED' ? 24 * 60 * 60 * 1000 : 5 * 60 * 1000;
    cacheSet(cacheKey, result, ttl);
    res.json(result);
  } catch (err) {
    console.error('match-detail error:', err.message, err.response?.data);
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

module.exports = router;
