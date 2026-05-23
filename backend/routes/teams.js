const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');

const router = express.Router();

// football-data.org — for fixtures list
const FD_BASE = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// api-football (RapidAPI) — for match events, goals, lineups
const AF_BASE = 'https://api-football-v1.p.rapidapi.com/v3';
const AF_HEADERS = {
  'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
  'x-rapidapi-key': process.env.FOOTBALL_API_KEY,
};

function wait(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

// GET /api/teams/epl
router.get('/epl', async (req, res) => {
  try {
    var resp = await axios.get(FD_BASE + '/competitions/PL/teams', { headers: FD_HEADERS });
    var teams = (resp.data.teams || []).map(function(t) {
      return { id: t.id, name: t.name, shortName: t.shortName, logo: t.crest, venue: t.venue };
    });
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teams/:teamId/matches
router.get('/:teamId/matches', async (req, res) => {
  try {
    var teamId = req.params.teamId;
    var resp = await axios.get(FD_BASE + '/teams/' + teamId + '/matches', {
      headers: FD_HEADERS,
      params: { season: 2024, limit: 50 },
    });

    var matches = (resp.data.matches || [])
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

// GET /api/teams/:teamId/match/:matchId
// Uses API-Football for rich event data
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    var matchId = req.params.matchId;
    var teamId = req.params.teamId;

    // Get basic match info from football-data.org
    var fdResp = await axios.get(FD_BASE + '/matches/' + matchId, { headers: FD_HEADERS });
    var m = fdResp.data;

    var basicMatch = {
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
        formation: null,
        lineup: null,
      },
      awayTeam: {
        id: m.awayTeam.id,
        name: m.awayTeam.name,
        logo: m.awayTeam.crest,
        formation: null,
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
      goals: (m.goals || []).map(function(g) {
        return {
          minute: g.minute,
          extraTime: g.injuryTime || null,
          team: g.team ? g.team.name : '',
          teamId: g.team ? g.team.id : null,
          scorer: g.scorer ? g.scorer.name : 'Unknown',
          assist: g.assist ? g.assist.name : null,
          type: g.type || 'REGULAR',
        };
      }),
      bookings: (m.bookings || []).map(function(b) {
        return {
          minute: b.minute,
          team: b.team ? b.team.name : '',
          player: b.player ? b.player.name : '',
          card: b.card,
        };
      }),
      substitutions: (m.substitutions || []).map(function(s) {
        return {
          minute: s.minute,
          team: s.team ? s.team.name : '',
          playerOut: s.playerOut ? s.playerOut.name : '',
          playerIn: s.playerIn ? s.playerIn.name : '',
        };
      }),
    };

    // Now try API-Football for richer data (lineups, detailed events)
    if (process.env.FOOTBALL_API_KEY) {
      try {
        await wait(500);

        // Find this fixture in API-Football by date and teams
        var kickoffDate = new Date(m.utcDate).toISOString().slice(0, 10);
        var fixtureResp = await axios.get(AF_BASE + '/fixtures', {
          headers: AF_HEADERS,
          params: {
            league: 39,
            season: 2024,
            date: kickoffDate,
          },
        });

        var fixtures = fixtureResp.data.response || [];

        // Find matching fixture by team names
        var fixture = null;
        for (var i = 0; i < fixtures.length; i++) {
          var f = fixtures[i];
          var hn = f.teams.home.name.toLowerCase();
          var an = f.teams.away.name.toLowerCase();
          var mhn = m.homeTeam.name.toLowerCase();
          var man = m.awayTeam.name.toLowerCase();
          if (hn.includes(mhn.split(' ')[0].toLowerCase()) || mhn.includes(hn.split(' ')[0].toLowerCase())) {
            fixture = f;
            break;
          }
        }

        if (fixture) {
          var fixtureId = fixture.fixture.id;
          await wait(500);

          // Fetch events (goals, cards, subs)
          var eventsResp = await axios.get(AF_BASE + '/fixtures/events', {
            headers: AF_HEADERS,
            params: { fixture: fixtureId },
          });

          var events = eventsResp.data.response || [];
          var goals = [], bookings = [], substitutions = [];

          for (var j = 0; j < events.length; j++) {
            var ev = events[j];
            var minute = ev.time ? ev.time.elapsed : null;
            var extra = ev.time ? ev.time.extra : null;
            var teamName = ev.team ? ev.team.name : '';
            var playerName = ev.player ? ev.player.name : '';
            var assistName = ev.assist ? ev.assist.name : null;

            if (ev.type === 'Goal') {
              goals.push({
                minute: minute,
                extraTime: extra,
                team: teamName,
                scorer: playerName,
                assist: assistName,
                type: ev.detail === 'Own Goal' ? 'OWN_GOAL' : ev.detail === 'Penalty' ? 'PENALTY' : 'REGULAR',
              });
            } else if (ev.type === 'Card') {
              bookings.push({
                minute: minute,
                team: teamName,
                player: playerName,
                card: ev.detail === 'Red Card' ? 'RED_CARD' : 'YELLOW_CARD',
              });
            } else if (ev.type === 'subst') {
              substitutions.push({
                minute: minute,
                team: teamName,
                playerOut: playerName,
                playerIn: assistName || '',
              });
            }
          }

          if (goals.length > 0) basicMatch.goals = goals;
          if (bookings.length > 0) basicMatch.bookings = bookings;
          if (substitutions.length > 0) basicMatch.substitutions = substitutions;

          await wait(500);

          // Fetch lineups
          var lineupResp = await axios.get(AF_BASE + '/fixtures/lineups', {
            headers: AF_HEADERS,
            params: { fixture: fixtureId },
          });

          var lineups = lineupResp.data.response || [];
          if (lineups.length >= 2) {
            var homeLineup = lineups[0];
            var awayLineup = lineups[1];

            basicMatch.homeTeam.formation = homeLineup.formation || null;
            basicMatch.homeTeam.lineup = {
              formation: homeLineup.formation,
              startXI: (homeLineup.startXI || []).map(function(p) {
                return {
                  name: p.player ? p.player.name : '',
                  position: p.player ? p.player.pos : '',
                  shirtNumber: p.player ? p.player.number : null,
                };
              }),
              bench: (homeLineup.substitutes || []).map(function(p) {
                return {
                  name: p.player ? p.player.name : '',
                  position: p.player ? p.player.pos : '',
                  shirtNumber: p.player ? p.player.number : null,
                };
              }),
            };

            basicMatch.awayTeam.formation = awayLineup.formation || null;
            basicMatch.awayTeam.lineup = {
              formation: awayLineup.formation,
              startXI: (awayLineup.startXI || []).map(function(p) {
                return {
                  name: p.player ? p.player.name : '',
                  position: p.player ? p.player.pos : '',
                  shirtNumber: p.player ? p.player.number : null,
                };
              }),
              bench: (awayLineup.substitutes || []).map(function(p) {
                return {
                  name: p.player ? p.player.name : '',
                  position: p.player ? p.player.pos : '',
                  shirtNumber: p.player ? p.player.number : null,
                };
              }),
            };
          }

          console.log('API-Football enriched match ' + matchId + ' with ' + basicMatch.goals.length + ' goals');
        }
      } catch (afErr) {
        console.error('API-Football enrichment failed:', afErr.message);
        // Continue with basic data from football-data.org
      }
    }

    res.json({ match: basicMatch });

  } catch (err) {
    console.error('Match detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
