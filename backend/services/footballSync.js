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
  if (['IN_PLAY','PAUSED','HALFTIME','LIVE'].includes(status)) return 'live';
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

function parseGoals(match) {
  const goals = [];
  if (!match.goals || !Array.isArray(match.goals)) return goals;
  for (const g of match.goals) {
    goals.push({
      minute:   g.minute,
      extraTime: g.injuryTime || null,
      team:     g.team?.name || '',
      scorer:   g.scorer?.name || 'Unknown',
      assist:   g.assist?.name || null,
      type:     g.type || 'REGULAR', // REGULAR, OWN_GOAL, PENALTY
    });
  }
  return goals;
}

async function syncMatches() {
  if (!API_KEY) { console.log('No FOOTBALL_DATA_KEY'); return; }

  for (const [leagueKey, league] of Object.entries(LEAGUES)) {
    try {
      console.log('Fetching matches for ' + league.name);

      const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
      const dateTo   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);

      const { data } = await axios.get(BASE + '/competitions/' + league.id + '/matches', {
        headers,
        params: { dateFrom, dateTo },
      });

      const matches = data.matches || [];
      console.log('Got ' + matches.length + ' matches for ' + league.name);

      for (const match of matches) {
        const goals = parseGoals(match);
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
            score:         getScore(match),
            goals,
            referee:       match.referees?.[0]?.name || '',
            venue:         match.venue || '',
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
        teamId:   e.team.id,
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
        params: { status: 'LIVE' },
      });

      for (const match of data.matches || []) {
        const goals = parseGoals(match);
        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          {
            status: 'live',
            score:  getScore(match),
            goals,
          },
          { upsert: false }
        );
      }

      if (data.matches?.length > 0) {
        console.log('Updated ' + data.matches.length + ' live matches');
      }
    } catch (err) {
      console.error('Live sync failed: ' + err.message);
    }
  }
}

module.exports = { syncMatches, syncStandings, syncLive };
