const express = require('express');
const Standing = require('../models/Standing');

const router = express.Router();

// GET /api/standings?league=epl
router.get('/', async (req, res) => {
  try {
    const { league } = req.query;
    const filter = league ? { league } : {};
    const standings = await Standing.find(filter).sort({ updatedAt: -1 });
    res.json({ standings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/standings/:league
router.get('/:league', async (req, res) => {
  try {
    const standing = await Standing.findOne({ league: req.params.league }).sort({ updatedAt: -1 });
    if (!standing) return res.status(404).json({ error: 'Standings not found.' });
    res.json({ standing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
