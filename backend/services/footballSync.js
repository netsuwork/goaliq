const axios = require('axios');
const Match = require('../models/Match');
const Standing = require('../models/Standing');

const API_KEY = process.env.FOOTBALL_DATA_KEY;
const BASE = 'https://api.football-data.org/v4';

const headers = { 'X-Auth-Token': API_KEY };

const LEAGUES = {
  epl: { id: 'PL',  name: 'Premier League'   },
  ucl: { id: 'CL',  name: 'Champions League'  },
  la:  { id: 'PD',  name: 'La Liga'           },
  bun: { id: 'BL1', name: 'Bundesliga'        },
  sa:  { id: 'SA',  name: 'Serie A'           },
  l1:  { id: 'FL1', name: 'Ligue 1'           },
};

async function syncMatches() {
  if (!API_KEY) {
    console.log('⚠️ No Football Data key — using demo data');
    return seedDemoMatches();
  }

  for (const [leagueKey, league] of Object.entries(LEAGUES)) {
    try {
      // Get upcoming matches
      const { data } = await axios.get(
        `${BASE}/competitions/${league.id}/matches`,
        {
          headers,
          params: { status: 'SCHEDULED', limit: 10 },
        }
      );

      for (const match of data.matches || []) {
        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          {
            externalId:   String(match.id),
            league:       leagueKey,
            leagueName:   league.name,
            homeTeam:     match.homeTeam.name,
            awayTeam:     match.awayTeam.name,
            homeTeamLogo: `https://crests.football-data.org/${match.homeTeam.id}.png`,
            awayTeamLogo: `https://crests.football-data.org/${match.awayTeam.id}.png`,
            kickoff:      new Date(match.utcDate),
            status:       'upcoming',
            score: {
              home: match.score?.fullTime?.home ?? null,
              away: match.score?.fullTime?.away ?? null,
            },
          },
          { upsert: true, new: true }
        );
      }

      // Get live matches
      const { data: liveData } = await axios.get(
        `${BASE}/competitions/${league.id}/matches`,
        {
          headers,
          params: { status: 'IN_PLAY' },
        }
      );

      for (const match of liveData.matches || []) {
        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          {
            externalId:   String(match.id),
            league:       leagueKey,
            leagueName:   league.name,
            homeTeam:     match.homeTeam.name,
            awayTeam:     match.awayTeam.name,
            homeTeamLogo: `https://crests.football-data.org/${match.homeTeam.id}.png`,
            awayTeamLogo: `https://crests.football-data.org/${match.awayTeam.id}.png`,
            kickoff:      new Date(match.utcDate),
            status:       'live',
            score: {
              home: match.score?.fullTime?.home ?? 0,
              away: match.score?.fullTime?.away ?? 0,
            },
          },
          { upsert: true, new: true }
        );
      }

      // Get recent results
      const { data: resultsData } = await axios.get(
        `${BASE}/competitions/${league.id}/matches`,
        {
          headers,
          params: { status: 'FINISHED', limit: 5 },
        }
      );

      for (const match of resultsData.matches || []) {
        await Match.findOneAndUpdate(
          { externalId: String(match.id) },
          {
            externalId:   String(match.id),
            league:       leagueKey,
            leagueName:   league.name,
            homeTeam:     match.homeTeam.name,
            awayTeam:     match.awayTeam.name,
            homeTeamLogo: `https://crests.football-data.org/${match.homeTeam.id}.png`,
            awayTeamLogo: `https://crests.football-data.org/${match.awayTeam.id}.png`,
            kickoff:      new Date(match.utcDate),
            status:       'finished',
            score: {
              home: match.score?.fullTime?.home ?? null,
              away: match.score?.fullTime?.away ?? null,
            },
          },
          { upsert: true, new: true }
        );
      }

      console.log(`✅ Synced ${league.name}`);
      // Wait 6 seconds between leagues to respect rate limits
      await new Promise(r => setTimeout(r, 6000));

    } catch (err) {
      console.error(`❌ Failed to sync ${league.name}:`, err.response?.data?.message || err.message);
    }
  }
}

async function syncStandings() {
  if (!API_KEY) return seedDemoStandings();

  for (const [leagueKey, league] of Object.entries(LEAGUES)) {
    try {
      const { data } = await axios.get(
        `${BASE}/competitions/${league.id}/standings`,
        { headers }
      );

      const raw = data.standings?.[0]?.table || [];
      const table = raw.map(entry => ({
        position: entry.position,
        team:     entry.team.name,
        teamLogo: `https://crests.football-data.org/${entry.team.id}.png`,
        played:   entry.playedGames,
        won:      entry.won,
        drawn:    entry.draw,
        lost:     entry.lost,
        gf:       entry.goalsFor,
        ga:       entry.goalsAgainst,
        gd:       entry.goalDifference,
        points:   entry.points,
        form:     entry.form || '',
      }));

      await Standing.findOneAndUpdate(
        { league: leagueKey },
        {
          league:     leagueKey,
          leagueName: league.name,
          season:     '2024',
          table,
          updatedAt:  new Date(),
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Synced standings for ${league.name}`);
      await new Promise(r => setTimeout(r, 6000));

    } catch (err) {
      console.error(`❌ Failed standings for ${league.name}:`, err.response?.data?.message || err.message);
    }
  }
}

async function seedDemoMatches() {
  const demos = [
    { league:'epl', leagueName:'Premier League', homeTeam:'Arsenal', awayTeam:'Man City', kickoff: daysFromNow(1), odds:{home:2.40,draw:3.50,away:2.80}, stats:{homeForm:'WWWDW',awayForm:'WDWWL',homeGoalsAvg:2.1,awayGoalsAvg:1.9}},
    { league:'ucl', leagueName:'Champions League', homeTeam:'Real Madrid', awayTeam:'Bayern Munich', kickoff: daysFromNow(2), odds:{home:2.10,draw:3.60,away:3.20}, stats:{homeForm:'WWWWW',awayForm:'WWDWW',homeGoalsAvg:2.4,awayGoalsAvg:2.2}},
    { league:'la',  leagueName:'La Liga', homeTeam:'Barcelona', awayTeam:'Atletico Madrid', kickoff: daysFromNow(3), odds:{home:1.95,draw:3.70,away:3.80}, stats:{homeForm:'WWWLW',awayForm:'WDWDW',homeGoalsAvg:2.5,awayGoalsAvg:1.1}},
    { league:'bun', leagueName:'Bundesliga', homeTeam:'Leverkusen', awayTeam:'Stuttgart', kickoff: daysFromNow(1), odds:{home:1.70,draw:3.90,away:4.50}, stats:{homeForm:'WWWWW',awayForm:'WDWLL',homeGoalsAvg:2.8,awayGoalsAvg:1.4}},
    { league:'epl', leagueName:'Premier League', homeTeam:'Chelsea', awayTeam:'Tottenham', kickoff: daysFromNow(4), odds:{home:2.20,draw:3.40,away:3.10}, stats:{homeForm:'WDLDW',awayForm:'LWWDL',homeGoalsAvg:1.7,awayGoalsAvg:1.8}},
    { league:'sa',  leagueName:'Serie A', homeTeam:'Inter Milan', awayTeam:'AC Milan', kickoff: daysFromNow(5), odds:{home:2.00,draw:3.40,away:3.60}, stats:{homeForm:'WWDWW',awayForm:'WLWWW',homeGoalsAvg:2.2,awayGoalsAvg:1.6}},
    { league:'l1',  leagueName:'Ligue 1', homeTeam:'PSG', awayTeam:'Marseille', kickoff: daysFromNow(2), odds:{home:1.55,draw:4.00,away:5.50}, stats:{homeForm:'WWWWW',awayForm:'WDLWW',homeGoalsAvg:3.1,awayGoalsAvg:1.9}},
  ];

  for (const d of demos) {
    await Match.findOneAndUpdate(
      { homeTeam: d.homeTeam, awayTeam: d.awayTeam, league: d.league },
      { ...d, status: 'upcoming' },
      { upsert: true, new: true }
    );
  }
  console.log('✅ Demo matches seeded');
}

async function seedDemoStandings() {
  const epl = {
    league: 'epl', leagueName: 'Premier League', season: '2024',
    table: [
      { position:1, team:'Arsenal',      played:33, won:23, drawn:6, lost:4,  gf:72, ga:29, gd:43,  points:75, form:'WWWDW' },
      { position:2, team:'Man City',     played:33, won:21, drawn:7, lost:5,  gf:68, ga:30, gd:38,  points:70, form:'WDWWL' },
      { position:3, team:'Liverpool',    played:33, won:20, drawn:8, lost:5,  gf:64, ga:29, gd:35,  points:68, form:'DWWLW' },
      { position:4, team:'Chelsea',      played:33, won:17, drawn:8, lost:8,  gf:55, ga:37, gd:18,  points:59, form:'WDLWD' },
      { position:5, team:'Man United',   played:33, won:15, drawn:6, lost:12, gf:38, ga:34, gd:4,   points:51, form:'LDWLW' },
      { position:6, team:'Tottenham',    played:33, won:14, drawn:7, lost:12, gf:44, ga:38, gd:6,   points:49, form:'WLDWL' },
      { position:7, team:'Aston Villa',  played:33, won:14, drawn:6, lost:13, gf:48, ga:40, gd:8,   points:48, form:'WWLDL' },
      { position:8, team:'Newcastle',    played:33, won:13, drawn:7, lost:13, gf:46, ga:43, gd:3,   points:46, form:'DWLWW' },
      { position:18,team:'Burnley',      played:33, won:5,  drawn:5, lost:23, gf:29, ga:70, gd:-41, points:20, form:'LDLLL' },
      { position:19,team:'Sheffield Utd',played:33, won:3,  drawn:5, lost:25, gf:25, ga:81, gd:-56, points:14, form:'LLLLL' },
    ]
  };
  await Standing.findOneAndUpdate({ league: 'epl', season: '2024' }, epl, { upsert: true });
  console.log('✅ Demo standings seeded');
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

module.exports = { syncMatches, syncStandings };
