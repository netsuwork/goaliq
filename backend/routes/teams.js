const express = require('express');
const axios = require('axios');
const Match = require('../models/Match');

const router = express.Router();

// football-data.org — fixtures list
const FD_BASE = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

// api-football.com direct — events, lineups, goals
const AF_BASE = 'https://v3.football.api-sports.io';
const AF_HEADERS = {
  'x-apisports-key': process.env.FOOTBALL_API_KEY,
};

function wait(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

// ── GET /api/teams/epl ────────────────────────────────────────────────────────
router.get('/epl', async (req, res) => {
  try {
    var resp = await axios.get(FD_BASE + '/competitions/PL/teams', { headers: FD_HEADERS });
    var teams = (resp.data.teams || []).map(function(t) {
      return {
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        logo: t.crest,
        venue: t.venue,
      };
    });
    res.json({ teams: teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/teams/:teamId/matches ────────────────────────────────────────────
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
        var ftHome = m.score && m.score.fullTime ? m.score.fullTime.home : null;
        var ftAway = m.score && m.score.fullTime ? m.score.fullTime.away : null;
        return {
          id: m.id,
          matchday: m.matchday,
          kickoff: m.utcDate,
          status: m.status,
          homeTeam: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest },
          awayTeam: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest },
          score: { home: ftHome, away: ftAway },
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

    res.json({ matches: matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/teams/:teamId/match/:matchId ─────────────────────────────────────
router.get('/:teamId/match/:matchId', async (req, res) => {
  try {
    var matchId = req.params.matchId;
    var teamId  = req.params.teamId;

    // Step 1: Basic match info from football-data.org
    var fdResp = await axios.get(FD_BASE + '/matches/' + matchId, { headers: FD_HEADERS });
    var m = fdResp.data;

    var ftHome = m.score && m.score.fullTime ? m.score.fullTime.home : null;
    var ftAway = m.score && m.score.fullTime ? m.score.fullTime.away : null;
    var htHome = m.score && m.score.halfTime ? m.score.halfTime.home : null;
    var htAway = m.score && m.score.halfTime ? m.score.halfTime.away : null;

    var result = {
      id:        m.id,
      matchday:  m.matchday,
      kickoff:   m.utcDate,
      status:    m.status,
      venue:     m.venue || '',
      referee:   m.referees && m.referees[0] ? m.referees[0].name : '',
      homeTeam: {
        id:        m.homeTeam.id,
        name:      m.homeTeam.name,
        logo:      m.homeTeam.crest,
        formation: null,
        lineup:    null,
      },
      awayTeam: {
        id:        m.awayTeam.id,
        name:      m.awayTeam.name,
        logo:      m.awayTeam.crest,
        formation: null,
        lineup:    null,
      },
      score: {
        home:     ftHome,
        away:     ftAway,
        halfTime: { home: htHome, away: htAway },
      },
      goals: (m.goals || []).map(function(g) {
        return {
          minute:    g.minute,
          extraTime: g.injuryTime || null,
          team:      g.team ? g.team.name : '',
          teamId:    g.team ? g.team.id : null,
          scorer:    g.scorer ? g.scorer.name : 'Unknown',
          assist:    g.assist ? g.assist.name : null,
          type:      g.type || 'REGULAR',
        };
      }),
      bookings:      (m.bookings || []).map(function(b) {
        return {
          minute: b.minute,
          team:   b.team ? b.team.name : '',
          player: b.player ? b.player.name : '',
          card:   b.card,
        };
      }),
      substitutions: (m.substitutions || []).map(function(s) {
        return {
          minute:    s.minute,
          team:      s.team ? s.team.name : '',
          playerOut: s.playerOut ? s.playerOut.name : '',
          playerIn:  s.playerIn ? s.playerIn.name : '',
        };
      }),
    };

    // Step 2: Enrich with api-football.com if key available
    if (process.env.FOOTBALL_API_KEY && m.status === 'FINISHED') {
      try {
        console.log('Fetching AF data for match:', matchId);

        // Find fixture ID by date + teams
        var kickoffDate = new Date(m.utcDate).toISOString().slice(0, 10);
        await wait(300);

        var afResp = await axios.get(AF_BASE + '/fixtures', {
          headers: AF_HEADERS,
          params: { league: 39, season: 2024, date: kickoffDate },
        });

        var fixtures = afResp.data.response || [];
        var fixture  = null;

        // Match by home team name similarity
        var homeFirst = m.homeTeam.name.split(' ')[0].toLowerCase();
        var awayFirst = m.awayTeam.name.split(' ')[0].toLowerCase();

        for (var i = 0; i < fixtures.length; i++) {
          var f = fixtures[i];
          var fHome = f.teams.home.name.toLowerCase();
          var fAway = f.teams.away.name.toLowerCase();
          if (
            (fHome.includes(homeFirst) || homeFirst.includes(fHome.split(' ')[0])) &&
            (fAway.includes(awayFirst) || awayFirst.includes(fAway.split(' ')[0]))
          ) {
            fixture = f;
            break;
          }
        }

        if (fixture) {
          var fid = fixture.fixture.id;
          console.log('Found AF fixture ID:', fid);
          await wait(300);

          // Fetch events
          var evResp = await axios.get(AF_BASE + '/fixtures/events', {
            headers: AF_HEADERS,
            params: { fixture: fid },
          });

          var events       = evResp.data.response || [];
          var afGoals      = [];
          var afBookings   = [];
          var afSubs       = [];

          for (var j = 0; j < events.length; j++) {
            var ev      = events[j];
            var minute  = ev.time ? ev.time.elapsed : null;
            var extra   = ev.time ? ev.time.extra   : null;
            var team    = ev.team   ? ev.team.name   : '';
            var player  = ev.player ? ev.player.name : '';
            var assist  = ev.assist ? ev.assist.name : null;

            if (ev.type === 'Goal') {
              afGoals.push({
                minute:    minute,
                extraTime: extra,
                team:      team,
                scorer:    player,
                assist:    assist,
                type:      ev.detail === 'Own Goal' ? 'OWN_GOAL'
                         : ev.detail === 'Penalty'  ? 'PENALTY'
                         : 'REGULAR',
              });
            } else if (ev.type === 'Card') {
              afBookings.push({
                minute: minute,
                team:   team,
                player: player,
                card:   ev.detail === 'Red Card' ? 'RED_CARD' : 'YELLOW_CARD',
              });
            } else if (ev.type === 'subst') {
              afSubs.push({
                minute:    minute,
                team:      team,
                playerOut: player,
                playerIn:  assist || '',
              });
            }
          }

          if (afGoals.length > 0)    result.goals         = afGoals;
          if (afBookings.length > 0) result.bookings      = afBookings;
          if (afSubs.length > 0)     result.substitutions = afSubs;

          console.log('AF events: ' + afGoals.length + ' goals, ' + afBookings.length + ' cards, ' + afSubs.length + ' subs');

          await wait(300);

          // Fetch lineups
          var luResp = await axios.get(AF_BASE + '/fixtures/lineups', {
            headers: AF_HEADERS,
            params: { fixture: fid },
          });

          var lineups = luResp.data.response || [];

          if (lineups.length >= 1) {
            var buildLineup = function(lu) {
              return {
                formation: lu.formation || null,
                startXI: (lu.startXI || []).map(function(p) {
                  return {
                    name:        p.player ? p.player.name   : '',
                    position:    p.player ? p.player.pos    : '',
                    shirtNumber: p.player ? p.player.number : null,
                  };
                }),
                bench: (lu.substitutes || []).map(function(p) {
                  return {
                    name:        p.player ? p.player.name   : '',
                    position:    p.player ? p.player.pos    : '',
                    shirtNumber: p.player ? p.player.number : null,
                  };
                }),
              };
            };

            // Match lineup to home/away by team name
            for (var k = 0; k < lineups.length; k++) {
              var lu = lineups[k];
              var luName = lu.team ? lu.team.name.toLowerCase() : '';
              if (luName.includes(homeFirst) || homeFirst.includes(luName.split(' ')[0])) {
                result.homeTeam.formation = lu.formation || null;
                result.homeTeam.lineup    = buildLineup(lu);
              } else {
                result.awayTeam.formation = lu.formation || null;
                result.awayTeam.lineup    = buildLineup(lu);
              }
            }

            console.log('AF lineups fetched successfully');
          }
        } else {
          console.log('No AF fixture found for date:', kickoffDate);
        }

      } catch (afErr) {
        console.error('AF enrichment failed:', afErr.response ? JSON.stringify(afErr.response.data) : afErr.message);
        // Continue with basic data
      }
    }

    res.json({ match: result });

  } catch (err) {
    console.error('Match detail error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
