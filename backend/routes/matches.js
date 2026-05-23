const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');

const router = express.Router();

const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// ── GET /api/matches ──────────────────────────────────────────────────────────
// Query params: competition, status, limit, dateFrom, dateTo
router.get('/', async (req, res) => {
  try {
    const { competition, status, limit = 20, dateFrom, dateTo } = req.query;

    const filter = {};

    // Only EPL
    filter.league = 'epl';

    // status filter — frontend may send SCHEDULED/TIMED/FINISHED or upcoming/finished/live
    if (status) {
      const raw = status.split(',').map(s => s.toLowerCase());
      const mapped = raw.map(s => {
        if (s === 'scheduled' || s === 'timed' || s === 'upcoming') return 'upcoming';
        if (s === 'finished' || s === 'awarded') return 'finished';
        if (s === 'in_play' || s === 'paused' || s === 'live') return 'live';
        return s;
      });
      filter.status = { $in: [...new Set(mapped)] };
    }

    if (dateFrom || dateTo) {
      filter.kickoff = {};
      if (dateFrom) filter.kickoff.$gte = new Date(dateFrom);
      if (dateTo)   filter.kickoff.$lte = new Date(dateTo);
    }

    const matches = await Match.find(filter)
      .sort({ kickoff: 1 })
      .limit(Number(limit));

    res.json({ matches });
  } catch (err) {
    console.error('GET /api/matches error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/upcoming ─────────────────────────────────────────────────
router.get('/upcoming', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const matches = await Match.find({
      league: 'epl',
      status: 'upcoming',
      kickoff: { $gte: new Date() },
    })
      .sort({ kickoff: 1 })
      .limit(Number(limit));

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/live ─────────────────────────────────────────────────────
router.get('/live', async (req, res) => {
  try {
    const matches = await Match.find({ league: 'epl', status: 'live' })
      .sort({ kickoff: 1 });
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/results ──────────────────────────────────────────────────
router.get('/results', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const matches = await Match.find({ league: 'epl', status: 'finished' })
      .sort({ kickoff: -1 })
      .limit(Number(limit));
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id).populate('aiPrediction');
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/:id/detail ───────────────────────────────────────────────
// Proxies football-data.org for full match detail: goals, lineups, bookings, subs
router.get('/:id/detail', async (req, res) => {
  try {
    const matchId = req.params.id;
    let footballMatchId = matchId;

    // If MongoDB ObjectId, look up the external football-data ID
    if (/^[a-f\d]{24}$/i.test(matchId)) {
      const dbMatch = await Match.findById(matchId);
      if (!dbMatch) return res.status(404).json({ error: 'Match not found' });
      footballMatchId = dbMatch.externalId;
      if (!footballMatchId) {
        return res.status(400).json({ error: 'No external match ID found' });
      }
    }

    const { data } = await axios.get(
      `${FOOTBALL_BASE}/matches/${footballMatchId}`,
      { headers: FOOTBALL_HEADERS }
    );

    res.json({ match: data });
  } catch (err) {
    console.error('Match detail fetch error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');

const router = express.Router();

const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// ── GET /api/matches ──────────────────────────────────────────────────────────
// Query params: competition, status, limit, dateFrom, dateTo
router.get('/', async (req, res) => {
  try {
    const { competition, status, limit = 20, dateFrom, dateTo } = req.query;

    const filter = {};

    // Only EPL
    filter.league = 'epl';

    // status filter — frontend may send SCHEDULED/TIMED/FINISHED or upcoming/finished/live
    if (status) {
      const raw = status.split(',').map(s => s.toLowerCase());
      const mapped = raw.map(s => {
        if (s === 'scheduled' || s === 'timed' || s === 'upcoming') return 'upcoming';
        if (s === 'finished' || s === 'awarded') return 'finished';
        if (s === 'in_play' || s === 'paused' || s === 'live') return 'live';
        return s;
      });
      filter.status = { $in: [...new Set(mapped)] };
    }

    if (dateFrom || dateTo) {
      filter.kickoff = {};
      if (dateFrom) filter.kickoff.$gte = new Date(dateFrom);
      if (dateTo)   filter.kickoff.$lte = new Date(dateTo);
    }

    const matches = await Match.find(filter)
      .sort({ kickoff: 1 })
      .limit(Number(limit));

    res.json({ matches });
  } catch (err) {
    console.error('GET /api/matches error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/upcoming ─────────────────────────────────────────────────
router.get('/upcoming', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const matches = await Match.find({
      league: 'epl',
      status: 'upcoming',
      kickoff: { $gte: new Date() },
    })
      .sort({ kickoff: 1 })
      .limit(Number(limit));

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/live ─────────────────────────────────────────────────────
router.get('/live', async (req, res) => {
  try {
    const matches = await Match.find({ league: 'epl', status: 'live' })
      .sort({ kickoff: 1 });
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/results ──────────────────────────────────────────────────
router.get('/results', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const matches = await Match.find({ league: 'epl', status: 'finished' })
      .sort({ kickoff: -1 })
      .limit(Number(limit));
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id).populate('aiPrediction');
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/:id/detail ───────────────────────────────────────────────
// Proxies football-data.org for full match detail: goals, lineups, bookings, subs
router.get('/:id/detail', async (req, res) => {
  try {
    const matchId = req.params.id;
    let footballMatchId = matchId;

    // If MongoDB ObjectId, look up the external football-data ID
    if (/^[a-f\d]{24}$/i.test(matchId)) {
      const dbMatch = await Match.findById(matchId);
      if (!dbMatch) return res.status(404).json({ error: 'Match not found' });
      footballMatchId = dbMatch.externalId;
      if (!footballMatchId) {
        return res.status(400).json({ error: 'No external match ID found' });
      }
    }

    const { data } = await axios.get(
      `${FOOTBALL_BASE}/matches/${footballMatchId}`,
      { headers: FOOTBALL_HEADERS }
    );

    res.json({ match: data });
  } catch (err) {
    console.error('Match detail fetch error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');

const router = express.Router();

const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// ── GET /api/matches ──────────────────────────────────────────────────────────
// Query params: competition, status, limit, dateFrom, dateTo
router.get('/', async (req, res) => {
  try {
    const { competition, status, limit = 20, dateFrom, dateTo } = req.query;

    const filter = {};

    // Only EPL
    filter.league = 'epl';

    // status filter — frontend may send SCHEDULED/TIMED/FINISHED or upcoming/finished/live
    if (status) {
      const raw = status.split(',').map(s => s.toLowerCase());
      const mapped = raw.map(s => {
        if (s === 'scheduled' || s === 'timed' || s === 'upcoming') return 'upcoming';
        if (s === 'finished' || s === 'awarded') return 'finished';
        if (s === 'in_play' || s === 'paused' || s === 'live') return 'live';
        return s;
      });
      filter.status = { $in: [...new Set(mapped)] };
    }

    if (dateFrom || dateTo) {
      filter.kickoff = {};
      if (dateFrom) filter.kickoff.$gte = new Date(dateFrom);
      if (dateTo)   filter.kickoff.$lte = new Date(dateTo);
    }

    const matches = await Match.find(filter)
      .sort({ kickoff: 1 })
      .limit(Number(limit));

    res.json({ matches });
  } catch (err) {
    console.error('GET /api/matches error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/upcoming ─────────────────────────────────────────────────
router.get('/upcoming', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const matches = await Match.find({
      league: 'epl',
      status: 'upcoming',
      kickoff: { $gte: new Date() },
    })
      .sort({ kickoff: 1 })
      .limit(Number(limit));

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/live ─────────────────────────────────────────────────────
router.get('/live', async (req, res) => {
  try {
    const matches = await Match.find({ league: 'epl', status: 'live' })
      .sort({ kickoff: 1 });
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/results ──────────────────────────────────────────────────
router.get('/results', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const matches = await Match.find({ league: 'epl', status: 'finished' })
      .sort({ kickoff: -1 })
      .limit(Number(limit));
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/:id ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id).populate('aiPrediction');
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json({ match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/:id/detail ───────────────────────────────────────────────
// Proxies football-data.org for full match detail: goals, lineups, bookings, subs
router.get('/:id/detail', async (req, res) => {
  try {
    const matchId = req.params.id;
    let footballMatchId = matchId;

    // If MongoDB ObjectId, look up the external football-data ID
    if (/^[a-f\d]{24}$/i.test(matchId)) {
      const dbMatch = await Match.findById(matchId);
      if (!dbMatch) return res.status(404).json({ error: 'Match not found' });
      footballMatchId = dbMatch.externalId;
      if (!footballMatchId) {
        return res.status(400).json({ error: 'No external match ID found' });
      }
    }

    const { data } = await axios.get(
      `${FOOTBALL_BASE}/matches/${footballMatchId}`,
      { headers: FOOTBALL_HEADERS }
    );

    res.json({ match: data });
  } catch (err) {
    console.error('Match detail fetch error:', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

module.exports = router;
