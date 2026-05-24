const axios = require('axios');
const Match = require('../models/Match');
const Standing = require('../models/Standing');

const FD_BASE    = 'https://api.football-data.org/v4';
const FD_HEADERS = { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY };

const AF_BASE = 'https://v3.football.api-sports.io';
const AF_KEY  = process.env.FOOTBALL_API_KEY;

function afHead() { return { 'x-apisports-key': AF_KEY }; }
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

const SEASON    = 2025; // 2025/26 season
const FD_SEASON = 2025;
const AF_LEAGUE = 39;   // Premier League on api-football

// ── Map status strings to our internal format ─────────────────────────────────
function mapStatus(s) {
  if (!s) return 'upcoming';
  s = s.toUpperCase();
  if (['IN_PLAY','PAUSED','HALFTIME','LIVE','1H','2H','HT','ET','P','BT'].includes(s)) return 'live';
  if (['FINISHED','FT','AET','PEN','AWARDED'].includes(s)) return 'finished';
  if (['POSTPONED','CANCELLED','SUSPENDED','ABD','CANC','PST'].includes(s)) return 'postponed';
  return 'upcoming';
}

// ── Parse goals from football-data.org format ─────────────────────────────────
function parseGoalsFD(goals) {
  return (goals || []).map(g => ({
    minute:    g.minute,
    extraTime: g.injuryTime || null,
    team:      g.team?.name  || '',
    teamId:    g.team?.id    || null,
    scorer:    g.scorer?.name || 'Unknown',
    assist:    g.assist?.name || null,
    type:      g.type || 'REGULAR',
  }));
}

// ── Parse goals from api-football.com events format ───────────────────────────
function parseGoalsAF(events) {
  return (events || [])
    .filter(e => e.type === 'Goal')
    .map(e => ({
      minute:    e.time?.elapsed ?? null,
      extraTime: e.time?.extra   ?? null,
      team:      e.team?.name    || '',
      teamId:    e.team?.id      || null,
      scorer:    e.player?.name  || 'Unknown',
      assist:    e.assist?.name  || null,
      type:      e.detail === 'Own Goal' ? 'OWN_GOAL'
               : e.detail === 'Penalty'  ? 'PENALTY' : 'REGULAR',
    }));
}

function parseBookingsAF(events) {
  return (events || [])
    .filter(e => e.type === 'Card')
    .map(e => ({
      minute: e.time?.elapsed ?? null,
      team:   e.team?.name    || '',
      player: e.player?.name  || '',
      card:   e.detail === 'Red Card' ? 'RED_CARD' : 'YELLOW_CARD',
    }));
}

function parseSubsAF(events) {
  return (events || [])
    .filter(e => e.type === 'subst')
    .map(e => ({
      minute:    e.time?.elapsed ?? null,
      team:      e.team?.name    || '',
      playerOut: e.player?.name  || '',
      playerIn:  e.assist?.name  || '',
    }));
}

// ── Fetch all EPL matches from football-data.org ──────────────────────────────
async function fetchFDMatches() {
  try {
    const { data } = await axios.get(`${FD_BASE}/competitions/PL/matches`, {
      headers: FD_HEADERS,
      params:  { season: FD_SEASON },
      timeout: 15000,
    });
    console.log(`FD: fetched ${(data.matches||[]).length} PL matches for ${FD_SEASON}`);
    return data.matches || [];
  } catch (err) {
    console.error('FD fetch failed:', err.response?.data?.message || err.message);
    return [];
  }
}

// ── Fetch all EPL matches from api-football.com ───────────────────────────────
async function fetchAFMatches() {
  if (!AF_KEY) { console.log('No AF key — skipping AF matches'); return []; }
  try {
    const { data } = await axios.get(`${AF_BASE}/fixtures`, {
      headers: afHead(),
      params:  { league: AF_LEAGUE, season: SEASON },
      timeout: 15000,
    });
    const resp = data.response || [];
    console.log(`AF: fetched ${resp.length} PL fixtures for ${SEASON}`);
    return resp;
  } catch (err) {
    console.error('AF fetch failed:', err.response?.data || err.message);
    return [];
  }
}

// ── Fetch events (goals/cards/subs) for a single AF fixture ──────────────────
async function fetchAFEvents(fixtureId) {
  if (!AF_KEY) return null;
  try {
    await wait(300);
    const { data } = await axios.get(`${AF_BASE}/fixtures/events`, {
      headers: afHead(),
      params:  { fixture: fixtureId },
      timeout: 8000,
    });
    return data.response || [];
  } catch (err) {
    console.error(`AF events fetch failed for fixture ${fixtureId}:`, err.message);
    return null;
  }
}

// ── Fetch lineups for a single AF fixture ─────────────────────────────────────
async function fetchAFLineups(fixtureId) {
  if (!AF_KEY) return null;
  try {
    await wait(300);
    const { data } = await axios.get(`${AF_BASE}/fixtures/lineups`, {
      headers: afHead(),
      params:  { fixture: fixtureId },
      timeout: 8000,
    });
    return data.response || [];
  } catch (err) {
    console.error(`AF lineups fetch failed for fixture ${fixtureId}:`, err.message);
    return null;
  }
}

// ── Main sync function ────────────────────────────────────────────────────────
async function syncMatches() {
  console.log(`\n🔄 Syncing EPL ${SEASON}/${SEASON+1} season...`);

  // 1. Fetch from both sources
  const [fdMatches, afFixtures] = await Promise.all([
    fetchFDMatches(),
    fetchAFMatches(),
  ]);

  // 2. Build AF lookup map by date + team names for matching
  const afByDate = {};
  for (const f of afFixtures) {
    const date = new Date(f.fixture.date).toISOString().slice(0, 10);
    if (!afByDate[date]) afByDate[date] = [];
    afByDate[date].push(f);
  }

  // 3. Process each FD match
  let synced = 0, withGoals = 0, withAF = 0;

  for (const m of fdMatches) {
    try {
      const status   = mapStatus(m.status);
      const fdGoals  = parseGoalsFD(m.goals);
      const kickoff  = new Date(m.utcDate);
      const dateKey  = kickoff.toISOString().slice(0, 10);

      // Find matching AF fixture
      const homeFirst = m.homeTeam.name.split(' ')[0].toLowerCase();
      const awayFirst = m.awayTeam.name.split(' ')[0].toLowerCase();
      const dayFixtures = afByDate[dateKey] || [];

      let afFixture = null;
      for (const f of dayFixtures) {
        const fh = f.teams.home.name.toLowerCase();
        const fa = f.teams.away.name.toLowerCase();
        if (
          (fh.includes(homeFirst) || homeFirst.includes(fh.split(' ')[0])) &&
          (fa.includes(awayFirst) || awayFirst.includes(fa.split(' ')[0]))
        ) { afFixture = f; break; }
      }

      // Build base doc from FD data
      const doc = {
        externalId:    String(m.id),
        league:        'epl',
        leagueName:    'Premier League',
        season:        String(SEASON),
        matchday:      m.matchday || null,
        round:         m.matchday ? `Matchday ${m.matchday}` : '',
        homeTeam:      m.homeTeam.name,
        awayTeam:      m.awayTeam.name,
        homeTeamId:    m.homeTeam.id,
        awayTeamId:    m.awayTeam.id,
        homeTeamLogo:  m.homeTeam.crest || `https://crests.football-data.org/${m.homeTeam.id}.png`,
        awayTeamLogo:  m.awayTeam.crest || `https://crests.football-data.org/${m.awayTeam.id}.png`,
        kickoff,
        status,
        score: {
          home: m.score?.fullTime?.home ?? null,
          away: m.score?.fullTime?.away ?? null,
        },
        halfTimeScore: {
          home: m.score?.halfTime?.home ?? null,
          away: m.score?.halfTime?.away ?? null,
        },
        referee: m.referees?.[0]?.name || '',
        goals:         fdGoals,
        bookings:      [],
        substitutions: [],
        afFixtureId:   afFixture ? afFixture.fixture.id : null,
      };

      if (fdGoals.length > 0) withGoals++;

      // Enrich finished matches with AF events + lineups
      if (afFixture && status === 'finished') {
        const fid    = afFixture.fixture.id;
        const events = await fetchAFEvents(fid);

        if (events) {
          const afGoals = parseGoalsAF(events);
          const afCards = parseBookingsAF(events);
          const afSubs  = parseSubsAF(events);

          // Prefer AF goals if available (more detail), else keep FD goals
          if (afGoals.length > 0) doc.goals = afGoals;
          if (afCards.length > 0) doc.bookings = afCards;
          if (afSubs.length  > 0) doc.substitutions = afSubs;
          withAF++;
        }

        const lineups = await fetchAFLineups(fid);
        if (lineups && lineups.length >= 2) {
          for (const lu of lineups) {
            const luName = lu.team?.name?.toLowerCase() || '';
            const isHome = luName.includes(homeFirst) || homeFirst.includes(luName.split(' ')[0]);
            const builtLineup = {
              formation: lu.formation || null,
              startXI: (lu.startXI || []).map(p => ({
                name:        p.player?.name   || '',
                position:    p.player?.pos    || '',
                shirtNumber: p.player?.number ?? null,
              })),
              bench: (lu.substitutes || []).map(p => ({
                name:        p.player?.name   || '',
                position:    p.player?.pos    || '',
                shirtNumber: p.player?.number ?? null,
              })),
            };
            if (isHome) {
              doc.homeFormation = lu.formation || null;
              doc.homeLineup    = builtLineup;
            } else {
              doc.awayFormation = lu.formation || null;
              doc.awayLineup    = builtLineup;
            }
          }
        }
      }

      await Match.findOneAndUpdate(
        { externalId: String(m.id) },
        doc,
        { upsert: true, new: true }
      );
      synced++;

      // Rate limit — AF free tier allows ~10 req/min
      if (afFixture && status === 'finished') await wait(700);

    } catch (err) {
      console.error(`Error syncing match ${m.id}:`, err.message);
    }
  }

  console.log(`✅ Synced ${synced} matches | ${withGoals} with FD goals | ${withAF} enriched with AF`);
}

// ── Sync standings ────────────────────────────────────────────────────────────
async function syncStandings() {
  console.log('\n🔄 Syncing EPL standings...');
  try {
    const { data } = await axios.get(`${FD_BASE}/competitions/PL/standings`, {
      headers: FD_HEADERS,
      params:  { season: FD_SEASON },
      timeout: 10000,
    });

    const raw   = data.standings?.[0]?.table || [];
    const table = raw.map(e => ({
      position: e.position,
      team:     e.team.name,
      teamId:   e.team.id,
      teamLogo: e.team.crest || `https://crests.football-data.org/${e.team.id}.png`,
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
      { league: 'epl', season: String(SEASON) },
      {
        league:     'epl',
        leagueName: 'Premier League',
        season:     String(SEASON),
        table,
        updatedAt:  new Date(),
      },
      { upsert: true, new: true }
    );
    console.log(`✅ Standings synced — ${table.length} teams`);
  } catch (err) {
    console.error('Standings sync failed:', err.response?.data?.message || err.message);
  }
}

// ── Sync live scores only ─────────────────────────────────────────────────────
async function syncLive() {
  try {
    const { data } = await axios.get(`${FD_BASE}/competitions/PL/matches`, {
      headers: FD_HEADERS,
      params:  { season: FD_SEASON, status: 'LIVE' },
      timeout: 8000,
    });

    for (const m of (data.matches || [])) {
      await Match.findOneAndUpdate(
        { externalId: String(m.id) },
        {
          status: 'live',
          score: {
            home: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
            away: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
          },
        },
        { upsert: false }
      );
    }
    if (data.matches?.length > 0) {
      console.log(`⚡ Updated ${data.matches.length} live matches`);
    }
  } catch (err) {
    console.error('Live sync failed:', err.message);
  }
}

module.exports = { syncMatches, syncStandings, syncLive };
