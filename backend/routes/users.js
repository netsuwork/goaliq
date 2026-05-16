const express = require('express');
const User = require('../models/User');
const Prediction = require('../models/Prediction');
const { protect } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('username avatar stats.points stats.predictionsCorrect stats.predictionsTotal stats.streak')
      .sort({ 'stats.points': -1 })
      .limit(20);
    res.json({ leaderboard: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/users/me/saved-predictions
router.get('/me/saved-predictions', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedPredictions',
      populate: { path: 'match' },
    });
    res.json({ predictions: user.savedPredictions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/users/me  — update profile
router.patch('/me', protect, async (req, res) => {
  try {
    const allowed = ['username', 'avatar', 'favouriteTeam'];
    const updates = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/users/:id  — public profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('username avatar stats favouriteTeam createdAt');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
