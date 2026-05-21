const express = require('express');
const axios = require('axios');
const Prediction = require('../models/Prediction');
const Match = require('../models/Match');
const { protect, optionalAuth } = require('../middleware/auth');
const { generateMatchPrediction } = require('../services/aiService');

const router = express.Router();

const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const FOOTBALL_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// Fetch real team stats from football API
async function fetchTeamStats(teamId, leagueId = 'PL') {
  try {
    const { data } = await axios.get(
      `${FOOTBALL_BASE}/teams/${teamId}/matches`,
      {
        headers: FOOTBALL_HEADERS,
        params: { status: 'FINISHED', limit: 10 },
      }
    );

    const matches = data.matches || [];
    if (!matches.length) return null;

    let wins = 0, draws = 0, losses = 0;
    let goalsScored = 0, goalsConceded = 0;
    let formStr = '';

    for (const m of matches.slice(0, 10)) {
      const isHome = m.homeTeam.id === teamId;
      const myGoals = isHome ? (m.score?.fullTime?.home ?? 0) : (m.score?.fullTime?.away ?? 0);
      const theirGoals = isHome ? (m.score?.fullTime?.away ?? 0) : (m.score?.fullTime?.home ?? 0);

      goalsScored += myGoals;
      goalsConceded += theirGoals;

      if (myGoals > theirGoals) { wins++; formStr += 'W'; }
      else if (myGoals === theirGoals) { draws++; formStr += 'D'; }
      else { losses++; formStr += 'L'; }
    }

    const played = matches.length;
    return {
      form: formStr.slice(0, 5),
      goalsAvg: parseFloat((goalsScored / played).toFixed(2)),
      goalsConcededAvg: parseFloat((goalsConceded / played).toFixed(2)),
      wins, draws, losses, played,
    };
  } catch (err) {
    console.error('Failed to fetch team stats:', err.message);
    return null;
  }
}

// Fetch H2H between two teams
async function fetchH2H(homeTeamId, awayTeamId) {
  try {
    const { data } = await axios.get(
      `${FOOTBALL_BASE}/teams/${homeTeamId}/matches`,
      {
        headers: FOOTBALL_HEADERS,
        params: { status: 'FINISHED', limit: 20 },
      }
    );

    const matches = (data.matches || []).filter(m =>
      m.homeTeam.id === awayTeamId || m.awayTeam.id === awayTeamId
    );

    let homeWins = 0, awayWins = 0, draws = 0;
    for (const m of matches) {
      const isHome = m.homeTeam.id === homeTeamId;
      const myGoals = isHome ? m.score?.fullTime?.home : m.score?.fullTime?.away;
      const theirGoals = isHome ? m.score?.fullTime?.away : m.score?.fullTime?.home;
      if (myGoals > theirGoals) homeWins++;
      else if (myGoals < theirGoals) awayWins++;
      else draws++;
    }

    return { homeWins, awayWins, draws, total: matches.length };
  } catch (err) {
    console.error('Failed to fetch H2H:', err.message);
    return { homeWins: 0, awayWins: 0, draws: 0, total: 0 };
  }
}

// POST /api/predictions/generate/:matchId
router.post('/generate/:matchId', optionalAuth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    if (!match) return res.status(404).json({ error: 'Match not found.' });

    // Return cached prediction if less than 2 hours old
    if (match.aiPrediction) {
      const cached = await Prediction.findById(match.aiPrediction);
      if (cached) {
        const ageMinutes = (Date.now() - new Date(cached.createdAt)) / 1000 / 60;
        if (ageMinutes < 120) {
          console.log('Returning cached prediction for:', match.homeTeam, 'vs', match.awayTeam);
          return res.json({ prediction: cached, cached: true });
        }
      }
    }

    // Fetch real team stats if we have team IDs
    let enrichedMatch = match.toObject();

    if (match.homeTeamId && match.awayTeamId) {
      console.log('Fetching real stats for:', match.homeTeam, 'vs', match.awayTeam);

      const [homeStats, awayStats, h2h] = await Promise.all([
        fetchTeamStats(match.homeTeamId),
        fetchTeamStats(match.awayTeamId),
        fetchH2H(match.homeTeamId, match.awayTeamId),
      ]);

      if (homeStats) {
        enrichedMatch.stats = enrichedMatch.stats || {};
        enrichedMatch.stats.homeForm = homeStats.form;
        enrichedMatch.stats.homeGoalsAvg = homeStats.goalsAvg;
        enrichedMatch.stats.homeGoalsConcededAvg = homeStats.goalsConcededAvg;
      }

      if (awayStats) {
        enrichedMatch.stats = enrichedMatch.stats || {};
        enrichedMatch.stats.awayForm = awayStats.form;
        enrichedMatch.stats.awayGoalsAvg = awayStats.goalsAvg;
        enrichedMatch.stats.awayGoalsConcededAvg = awayStats.goalsConcededAvg;
      }

      if (h2h.total > 0) {
        enrichedMatch.stats.h2hHomeWins = h2h.homeWins;
        enrichedMatch.stats.h2hAwayWins = h2h.awayWins;
        enrichedMatch.stats.h2hDraws = h2h.draws;
      }

      console.log('Stats fetched — Home form:', enrichedMatch.stats?.homeForm, '| Away form:', enrichedMatch.stats?.awayForm);
      console.log('Home xG avg:', enrichedMatch.stats?.homeGoalsAvg, '| Away xG avg:', enrichedMatch.stats?.awayGoalsAvg);
    } else {
      console.log('No team IDs — using default stats for:', match.homeTeam, 'vs', match.awayTeam);
    }

    // Generate prediction with real data
    const data = await generateMatchPrediction(enrichedMatch);

    // Save prediction
    const prediction = await Prediction.create({
      match: match._id,
      generatedBy: 'ai',
      ...data,
    });

    // Link to match
    match.aiPrediction = prediction._id;
    await match.save();

    if (req.user) {
      req.user.stats.predictionsTotal += 1;
      await req.user.save();
    }

    res.json({ prediction, cached: false });

  } catch (err) {
    console.error('Prediction error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/predictions
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

// POST /api/predictions/save/:id
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
