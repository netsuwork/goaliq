const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

const COMPETITION_IDS = {
  PL:  2021,
  UCL: 2001,
  BL1: 2002,
  SA:  2019,
  PD:  2014,
  FL1: 2015,
};

// ── GET /api/matches ──────────────────────────────────────────────────────────
// Query params: competition, status, limit, dateFrom, dateTo
router.get('/', async (req, res) => {
  try {
    const { competition = 'PL', status, limit = 20, dateFrom, dateTo } = req.query;

    const filter = {};

    // competition filter
    if (competition) filter.competition = competition.toUpperCase();

    // status filter — accepts comma-separated values e.g. status=SCHEDULED,TIMED
    if (status) {
      const statuses = status.toUpperCase().split(',');
      filter.status = { $in: statuses };
    }

    // date range filter
    if (dateFrom || dateTo) {
      filter.utcDate = {};
      if (dateFrom) filter.utcDate.$gte = new Date(dateFrom);
      if (dateTo)   filter.utcDate.$lte = new Date(dateTo);
    }

    const matches = await Match.find(filter)
      .sort({ utcDate: 1 })
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
    const { competition = 'PL', limit = 10 } = req.query;

    const filter = {
      status: { $in: ['SCHEDULED', 'TIMED'] },
      utcDate: { $gte: new Date() },
    };
    if (competition) filter.competition = competition.toUpperCase();

    const matches = await Match.find(filter)
      .sort({ utcDate: 1 })
      .limit(Number(limit));

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/live ─────────────────────────────────────────────────────
router.get('/live', async (req, res) => {
  try {
    const { competition } = req.query;
    const filter = { status: { $in: ['IN_PLAY', 'PAUSED', 'HALFTIME'] } };
    if (competition) filter.competition = competition.toUpperCase();

    const matches = await Match.find(filter).sort({ utcDate: 1 });
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/matches/results ──────────────────────────────────────────────────
router.get('/results', async (req, res) => {
  try {
    const { competition = 'PL', limit = 20 } = req.query;

    const filter = { status: 'FINISHED' };
    if (competition) filter.competition = competition.toUpperCase();

    const matches = await Match.find(filter)
      .sort({ utcDate: -1 })
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

      // Try common field names for the external ID
      footballMatchId = dbMatch.footballDataId
        || dbMatch.externalId
        || dbMatch.matchId
        || dbMatch.fdId
        || dbMatch.id;

      if (!footballMatchId) {
        return res.status(400).json({
          error: 'No football-data match ID stored for this match. Check your Match model.'
        });
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
