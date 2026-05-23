const axios = require('axios');
const Match = require('../models/Match');
const Standing = require('../models/Standing');

const API_KEY = process.env.FOOTBALL_DATA_KEY;
const BASE = 'https://api.football-data.org/v4';
const HEADERS = { 'X-Auth-Token': API_KEY };

const LEAGUES = {
  epl: { id: 'PL', name: 'Premier League' },
};

function wait(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

function mapStatus(status) {
  if (['IN_PLAY','PAUSED','HALFTIME','LIVE'].includes(status)) return 'live';
  if (['FINISHED','AWARDED'].includes(status)) return 'finished';
  if (['POSTPONED','CANCELLED','SUSPENDED'].includes(status)) return 'postponed';
  return 'upcoming';
}

function getScore(match) {
  var ft = match.score && match.score.fullTime ? match.score.fullTime : {};
  var ht = match.score && match.score.halfTime ? match.score.halfTime : {};
  return {
    home: ft.home !== undefined ? ft.home : (ht.home !== undefined ? ht.home : null),
    away: ft.away !== undefined ? ft.away : (ht.away !== undefined ? ht.away : null),
  };
}

function parseGoals(match) {
  var goals = [];
  if (!match.goals || !Array.isArray(match.goals)) return goals;
  for (var i = 0; i < match.goals.length; i++) {
    var g = match.goals[i];
    goals.push({
      minute:    g.minute || null,
      extraTime: g.injuryTime || null,
      team:      g.team ? g.team.name : '',
      teamId:    g.team ? g.team.id : null,
      scorer:    g.scorer ? g.scorer.name : 'Unknown',
      assist:    g.assist ? g.assist.name : null,
      type:      g.type || 'REGULAR',
    });
  }
  return goals;
}

async function syncMatches() {
  if (!API_KEY) {
    console.log('No FOOTBALL_DATA_KEY — skipping sync');
    return;
  }

  var leagueKeys = Object.keys(LEAGUES);
  for (var i = 0; i < leagueKeys.length; i++) {
    var leagueKey = leagueKeys[i];
    var league = LEAGUES[leagueKey];

    try {
      console.log('Fetching matches for ' + league.name);

      var dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
      var dateTo   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);

      var resp = await axios.get(BASE + '/competitions/' + league.id + '/matches', {
        headers: HEADERS,
        params: { dateFrom: dateFrom, dateTo: dateTo },
      });

      var matches = resp.data.matches || [];
      console.log('Got ' + matches.length + ' matches for ' + league.name);

      for (var j = 0; j < matches.length; j++) {
        var match = matches[j];
        var goals = parseGoals(match);
        var score = getScore(match);

        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          {
            externalId:    String(match.id),
            league:        leagueKey,
            leagueName:    league.name,
            season:        '2024',
            round:         match.matchday ? 'Matchday ' + match.matchday : '',
            matchday:      match.matchday || null,
            homeTeam:      match.homeTeam.name,
            awayTeam:      match.awayTeam.name,
            homeTeamId:    match.homeTeam.id,
            awayTeamId:    match.awayTeam.id,
            homeTeamLogo:  match.homeTeam.crest || '',
            awayTeamLogo:  match.awayTeam.crest || '',
            kickoff:       new Date(match.utcDate),
            status:        mapStatus(match.status),
            score:         score,
            goals:         goals,
            referee:       match.referees && match.referees[0] ? match.referees[0].name : '',
            venue:         match.venue || '',
          },
          { upsert: true, new: true }
        );
      }

      console.log('Synced ' + matches.length + ' matches for ' + league.name);
      await wait(2000);

    } catch (err) {
      console.error('Failed ' + league.name + ': ' + (err.response && err.response.data ? err.response.data.message : err.message));
    }
  }
}

async function syncStandings() {
  if (!API_KEY) {
    console.log('No FOOTBALL_DATA_KEY — skipping standings sync');
    return;
  }

  var leagueKeys = Object.keys(LEAGUES);
  for (var i = 0; i < leagueKeys.length; i++) {
    var leagueKey = leagueKeys[i];
    var league = LEAGUES[leagueKey];

    try {
      var resp = await axios.get(BASE + '/competitions/' + league.id + '/standings', { headers: HEADERS });
      var raw = resp.data.standings && resp.data.standings[0] ? resp.data.standings[0].table : [];

      var table = raw.map(function(e) {
        return {
          position: e.position,
          team:     e.team.name,
          teamLogo: e.team.crest || '',
          played:   e.playedGames,
          won:      e.won,
          drawn:    e.draw,
          lost:     e.lost,
          gf:       e.goalsFor,
          ga:       e.goalsAgainst,
          gd:       e.goalDifference,
          points:   e.points,
          form:     e.form || '',
        };
      });

      await Standing.findOneAndUpdate(
        { league: leagueKey },
        {
          league:     leagueKey,
          leagueName: league.name,
          season:     '2024',
          table:      table,
          updatedAt:  new Date(),
        },
        { upsert: true, new: true }
      );

      console.log('Synced standings for ' + league.name);
      await wait(2000);

    } catch (err) {
      console.error('Standings failed: ' + (err.response && err.response.data ? err.response.data.message : err.message));
    }
  }
}

async function syncLive() {
  if (!API_KEY) return;

  var leagueKeys = Object.keys(LEAGUES);
  for (var i = 0; i < leagueKeys.length; i++) {
    var leagueKey = leagueKeys[i];
    var league = LEAGUES[leagueKey];

    try {
      var resp = await axios.get(BASE + '/competitions/' + league.id + '/matches', {
        headers: HEADERS,
        params: { status: 'LIVE' },
      });

      var matches = resp.data.matches || [];
      for (var j = 0; j < matches.length; j++) {
        var match = matches[j];
        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          {
            status: 'live',
            score:  getScore(match),
            goals:  parseGoals(match),
          },
          { upsert: false }
        );
      }

      if (matches.length > 0) {
        console.log('Updated ' + matches.length + ' live matches for ' + league.name);
      }
    } catch (err) {
      console.error('Live sync failed: ' + err.message);
    }
  }
}

module.exports = { syncMatches, syncStandings, syncLive };
