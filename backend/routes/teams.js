const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');

const router = express.Router();

const BASE = 'https://api.football-data.org/v4';
const HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// GET /api/teams/epl — all PL teams this season
router.get('/epl', async (req, res) => {
  try {
    const { data } = await axios.get(`${BASE}/competitions/PL/teams`, { headers: HEADERS });
    const teams = (data.teams || []).map(t => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      logo: t.crest,
      venue: t.venue,
      founded: t.founded,
    }));
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/matches — all matches for a team this season
router.get('/:teamId/matches', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { data } = await axios.get(`${BASE}/teams/${teamId}/matches`, {
      headers: HEADERS,
      params: { season: 2024, status: 'FINISHED,SCHEDULED,IN_PLAY', limit: 50 },
    });

    const matches = (data.matches || [])
      .filter(m => m.competition?.code === 'PL')
      .map(m => ({
        id: m.id,
        matchday: m.matchday,
        kickoff: m.utcDate,
        status: m.status,
        homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest },
        awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest },
        score: {
          home: m.score?.fullTime?.home ?? null,
          away: m.score?.fullTime?.away ?? null,
        },
        goals: (m.goals || []).map(g => ({
          minute: g.minute,
          extraTime: g.injuryTime || null,
          team: g.team?.name,
          scorer: g.scorer?.name || 'Unknown',
          assist: g.assist?.name || null,
          type: g.type || 'REGULAR',
        })),
      }));

    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/match/:matchId — single match detail with lineup
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    // Fetch match detail
    const { data: matchData } = await axios.get(`${BASE}/matches/${matchId}`, { headers: HEADERS });
    const m = matchData;

    // Fetch lineups (head2head endpoint gives us more data)
    let homeLineup = null;
    let awayLineup = null;

    try {
      const { data: h2hData } = await axios.get(`${BASE}/matches/${matchId}`, { headers: HEADERS });
      if (h2hData.homeTeam?.lineup) {
        homeLineup = {
          formation: h2hData.homeTeam.formation || null,
          startXI: (h2hData.homeTeam.lineup || []).map(p => ({
            name: p.name,
            position: p.position,
            shirtNumber: p.shirtNumber,
          })),
          bench: (h2hData.homeTeam.bench || []).map(p => ({
            name: p.name,
            position: p.position,
            shirtNumber: p.shirtNumber,
          })),
        };
        awayLineup = {
          formation: h2hData.awayTeam.formation || null,
          startXI: (h2hData.awayTeam.lineup || []).map(p => ({
            name: p.name,
            position: p.position,
            shirtNumber: p.shirtNumber,
          })),
          bench: (h2hData.awayTeam.bench || []).map(p => ({
            name: p.name,
            position: p.position,
            shirtNumber: p.shirtNumber,
          })),
        };
      }
    } catch (lineupErr) {
      console.log('Lineup not available:', lineupErr.message);
    }

    const goals = (m.goals || []).map(g => ({
      minute: g.minute,
      extraTime: g.injuryTime || null,
      team: g.team?.name,
      teamId: g.team?.id,
      scorer: g.scorer?.name || 'Unknown',
      assist: g.assist?.name || null,
      type: g.type || 'REGULAR',
    }));

    const bookings = (m.bookings || []).map(b => ({
      minute: b.minute,
      team: b.team?.name,
      player: b.player?.name,
      card: b.card,
    }));

    const substitutions = (m.substitutions || []).map(s => ({
      minute: s.minute,
      team: s.team?.name,
      playerOut: s.playerOut?.name,
      playerIn: s.playerIn?.name,
    }));

    res.json({
      match: {
        id: m.id,
        matchday: m.matchday,
        kickoff: m.utcDate,
        status: m.status,
        venue: m.venue,
        referee: m.referees?.[0]?.name || null,
        homeTeam: {
          id: m.homeTeam.id,
          name: m.homeTeam.name,
          logo: m.homeTeam.crest,
          formation: m.homeTeam.formation || null,
          lineup: homeLineup,
        },
        awayTeam: {
          id: m.awayTeam.id,
          name: m.awayTeam.name,
          logo: m.awayTeam.crest,
          formation: m.awayTeam.formation || null,
          lineup: awayLineup,
        },
        score: {
          home: m.score?.fullTime?.home ?? null,
          away: m.score?.fullTime?.away ?? null,
          halfTime: {
            home: m.score?.halfTime?.home ?? null,
            away: m.score?.halfTime?.away ?? null,
          },
        },
        goals,
        bookings,
        substitutions,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
