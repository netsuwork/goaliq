// Add this route to backend/routes/matches.js (or wherever your match routes live)
// It proxies the football-data.org match detail endpoint so the API key stays on the server.

const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');
const router = express.Router();

const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// ── existing routes above ──

// GET /api/matches/:id/detail
// Fetches full match detail (goals, lineups, bookings, subs) from football-data.org
router.get('/:id/detail', async (req, res) => {
  try {
    const matchId = req.params.id;

    // First try to find the football-data match ID from our DB
    let footballMatchId = matchId;

    // If it looks like a MongoDB ObjectId, look up the footballDataId
    if (/^[a-f\d]{24}$/i.test(matchId)) {
      const dbMatch = await Match.findById(matchId);
      if (!dbMatch) return res.status(404).json({ error: 'Match not found' });
      footballMatchId = dbMatch.footballDataId || dbMatch.externalId || dbMatch.matchId;
      if (!footballMatchId) {
        return res.status(400).json({ error: 'No football-data match ID stored for this match' });
      }
    }

    const { data } = await axios.get(
      `${FOOTBALL_BASE}/matches/${footballMatchId}`,
      { headers: FOOTBALL_HEADERS }
    );

    res.json({ match: data });
  } catch (err) {
    console.error('Match detail fetch error:', err.message);
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
