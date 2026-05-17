const axios = require('axios');
const Match = require('../models/Match');
const Standing = require('../models/Standing');
 
const API_KEY = process.env.FOOTBALL_DATA_KEY;
const BASE = 'https://api.football-data.org/v4';
const headers = { 'X-Auth-Token': API_KEY };
 
const LEAGUES = {
  epl: { id: 'PL', name: 'Premier League' },
};
 
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
 
function mapStatus(status) {
  if (['IN_PLAY','PAUSED','HALFTIME'].includes(status)) return 'live';
  if (['FINISHED','AWARDED'].includes(status)) return 'finished';
  if (['POSTPONED','CANCELLED','SUSPENDED'].includes(status)) return 'postponed';
  return 'upcoming';
}
 
function getScore(match) {
  return {
    home: match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? null,
    away: match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? null,
  };
}
 
async function syncMatches() {
  if (!API_KEY) { console.log('No FOOTBALL_DATA_KEY'); return; }
  for (const [leagueKey, league] of Object.entries(LEAGUES)) {
    try {
      console.log('Fetching matches for ' + league.name);
      const { data } = await axios.get(BASE + '/competitions/' + league.id + '/matches', {
        headers,
        params: {
  dateFrom: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0,10),
  dateTo:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,10),
},
      });
      const matches = data.matches || [];
      for (const match of matches) {
        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          {
            externalId:   String(match.id),
            league:       leagueKey,
            leagueName:   league.name,
            season:       '2024',
            homeTeam:     match.homeTeam.name,
            awayTeam:     match.awayTeam.name,
            homeTeamLogo: match.homeTeam.crest || '',
            awayTeamLogo: match.awayTeam.crest || '',
            kickoff:      new Date(match.utcDate),
            status:       mapStatus(match.status),
            score:        getScore(match),
          },
          { upsert: true, new: true }
        );
      }
      console.log('Synced ' + matches.length + ' matches for ' + league.name);
      await wait(2000);
    } catch (err) {
      console.error('Failed ' + league.name + ': ' + (err.response?.data?.message || err.message));
    }
  }
}
 
async function syncStandings() {
  if (!API_KEY) { console.log('No FOOTBALL_DATA_KEY'); return; }
  for (const [leagueKey, league] of Object.entries(LEAGUES)) {
    try {
      const { data } = await axios.get(BASE + '/competitions/' + league.id + '/standings', { headers });
      const raw = data.standings?.[0]?.table || [];
      const table = raw.map(e => ({
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
      }));
      await Standing.findOneAndUpdate(
        { league: leagueKey },
        { league: leagueKey, leagueName: league.name, season: '2024', table, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      console.log('Synced standings for ' + league.name);
      await wait(2000);
    } catch (err) {
      console.error('Standings failed: ' + (err.response?.data?.message || err.message));
    }
  }
}
 
async function syncLive() {
  if (!API_KEY) return;
  for (const [leagueKey, league] of Object.entries(LEAGUES)) {
    try {
      const { data } = await axios.get(BASE + '/competitions/' + league.id + '/matches', {
        headers,
        params: { status: 'IN_PLAY,PAUSED,HALFTIME' },
      });
      for (const match of data.matches || []) {
        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          { status: 'live', score: getScore(match) },
          { upsert: false }
        );
      }
      if (data.matches?.length > 0) console.log('Updated ' + data.matches.length + ' live matches');
    } catch (err) {
      console.error('Live sync failed: ' + err.message);
    }
  }
}
 
module.exports = { syncMatches, syncStandings, syncLive };
