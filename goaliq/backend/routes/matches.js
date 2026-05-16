const express = require('express');
const Match = require('../models/Match');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/matches?league=epl&status=upcoming&limit=10
router.get('/', async (req, res) => {
  try {
    const { league, status = 'upcoming', limit = 20, page = 1 } = req.query;
    const filter = {};
    if (league) filter.league = league;
    if (status) filter.status = status;

    const total = await Match.countDocuments(filter);
    const matches = await Match.find(filter)
      .sort({ kickoff: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('aiPrediction');

    res.json({ matches, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matches/live
router.get('/live', async (req, res) => {
  try {
    const matches = await Match.find({ status: 'live' })
      .sort({ kickoff: -1 })
      .populate('aiPrediction');
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matches/:id
router.get('/:id', async (req, res) => {
  try {
    const match = await Match.findById(req.params.id).populate('aiPrediction');
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    res.json({ match });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/matches (admin only — create manual match)
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const match = await Match.create(req.body);
    res.status(201).json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PATCH /api/matches/:id (admin only)
router.patch('/:id', protect, adminOnly, async (req, res) => {
  try {
    const match = await Match.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!match) return res.status(404).json({ error: 'Match not found.' });
    res.json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
