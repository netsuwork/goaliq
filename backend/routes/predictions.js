const express = require('express');
const Prediction = require('../models/Prediction');
const Match = require('../models/Match');
const { protect, optionalAuth } = require('../middleware/auth');
const { generateMatchPrediction } = require('../services/aiService');

const router = express.Router();

// POST /api/predictions/generate/:matchId  — generate AI prediction for a match
router.post('/generate/:matchId', optionalAuth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    // Return cached prediction if it exists and is less than 1 hour old
    if (match.aiPrediction) {
      const cached = await Prediction.findById(match.aiPrediction);
      if (cached) {
        const age = (Date.now() - new Date(cached.createdAt)) / 1000 / 60;
        if (age < 60) return res.json({ prediction: cached, cached: true });
      }
    }

    // Generate new AI prediction
    const data = await generateMatchPrediction(match);
    const prediction = await Prediction.create({
      match: match._id,
      generatedBy: 'ai',
      ...data,
    });

    // Link prediction to match
    match.aiPrediction = prediction._id;
    await match.save();

    // If user is logged in, track their stats
    if (req.user) {
      req.user.stats.predictionsTotal += 1;
      await req.user.save();
    }

    res.json({ prediction, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/predictions?matchId=...
router.get('/', async (req, res) => {
  try {
    const { matchId, limit = 10 } = req.query;
    const filter = {};
    if (matchId) filter.match = matchId;
    const predictions = await Prediction.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate('match');
    res.json({ predictions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/predictions/:id
router.get('/:id', async (req, res) => {
  try {
    const prediction = await Prediction.findById(req.params.id).populate('match');
    if (!prediction) return res.status(404).json({ error: 'Prediction not found.' });
    res.json({ prediction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/predictions/save/:id  — user saves a prediction
router.post('/save/:id', protect, async (req, res) => {
  try {
    const prediction = await Prediction.findById(req.params.id);
    if (!prediction) return res.status(404).json({ error: 'Prediction not found.' });

    const user = req.user;
    if (!user.savedPredictions.includes(prediction._id)) {
      user.savedPredictions.push(prediction._id);
      await user.save();
    }
    res.json({ message: 'Prediction saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
