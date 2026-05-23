const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');

const router = express.Router();

const BASE = 'https://api.football-data.org/v4';
const HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// GET /api/teams/epl — all PL teams
router.get('/epl', async (req, res) => {
  try {
    const { data } = await axios.get(BASE + '/competitions/PL/teams', { headers: HEADERS });
    const teams = (data.teams || []).map(function(t) {
      return {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        logo: t.crest,
        venue: t.venue,
        founded: t.founded,
      };
    });
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/matches — all matches for a team this season
router.get('/:teamId/matches', async (req, res) => {
  try {
    var teamId = req.params.teamId;
    var { data } = await axios.get(BASE + '/teams/' + teamId + '/matches', {
      headers: HEADERS,
      params: { season: 2024, limit: 50 },
    });

    var matches = (data.matches || [])
      .filter(function(m) { return m.competition && m.competition.code === 'PL'; })
      .map(function(m) {
        return {
          id: m.id,
          matchday: m.matchday,
          kickoff: m.utcDate,
          status: m.status,
          homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest },
          awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest },
          score: {
            home: m.score && m.score.fullTime ? m.score.fullTime.home : null,
            away: m.score && m.score.fullTime ? m.score.fullTime.away : null,
          },
          goals: (m.goals || []).map(function(g) {
            return {
              minute: g.minute,
              extraTime: g.injuryTime || null,
              team: g.team ? g.team.name : '',
              scorer: g.scorer ? g.scorer.name : 'Unknown',
              assist: g.assist ? g.assist.name : null,
              type: g.type || 'REGULAR',
            };
          }),
        };
      });

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/match/:matchId — single match detail
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    var matchId = req.params.matchId;
    var teamId = req.params.teamId;

    // First try our own MongoDB database
    var dbMatch = await Match.findOne({ externalId: String(matchId) });

    if (dbMatch) {
      return res.json({
        match: {
          id: dbMatch.externalId,
          matchday: dbMatch.matchday,
          kickoff: dbMatch.kickoff,
          status: dbMatch.status === 'finished' ? 'FINISHED' : dbMatch.status.toUpperCase(),
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
            home: dbMatch.score ? dbMatch.score.home : null,
            away: dbMatch.score ? dbMatch.score.away : null,
            halfTime: { home: null, away: null },
          },
          goals: dbMatch.goals || [],
          bookings: [],
          substitutions: [],
        }
      });
    }

    // Fallback to external API
    var resp = await axios.get(BASE + '/matches/' + matchId, { headers: HEADERS });
    var m = resp.data;

    var goals = (m.goals || []).map(function(g) {
      return {
        minute: g.minute,
        extraTime: g.injuryTime || null,
        team: g.team ? g.team.name : '',
        teamId: g.team ? g.team.id : null,
        scorer: g.scorer ? g.scorer.name : 'Unknown',
        assist: g.assist ? g.assist.name : null,
        type: g.type || 'REGULAR',
      };
    });

    var bookings = (m.bookings || []).map(function(b) {
      return {
        minute: b.minute,
        team: b.team ? b.team.name : '',
        player: b.player ? b.player.name : '',
        card: b.card,
      };
    });

    var substitutions = (m.substitutions || []).map(function(s) {
      return {
        minute: s.minute,
        team: s.team ? s.team.name : '',
        playerOut: s.playerOut ? s.playerOut.name : '',
        playerIn: s.playerIn ? s.playerIn.name : '',
      };
    });

    res.json({
      match: {
        id: m.id,
        matchday: m.matchday,
        kickoff: m.utcDate,
        status: m.status,
        venue: m.venue || '',
        referee: m.referees && m.referees[0] ? m.referees[0].name : '',
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
          home: m.score && m.score.fullTime ? m.score.fullTime.home : null,
          away: m.score && m.score.fullTime ? m.score.fullTime.away : null,
          halfTime: {
            home: m.score && m.score.halfTime ? m.score.halfTime.home : null,
            away: m.score && m.score.halfTime ? m.score.halfTime.away : null,
          },
        },
        goals,
        bookings,
        substitutions,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
