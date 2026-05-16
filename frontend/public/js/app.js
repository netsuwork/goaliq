// GoalIQ — Main App Logic
let currentLeague = 'all';
let currentMatches = [];
let selectedMatchId = null;
let chatHistory = [];
let livePollingInterval = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await Auth.init();
  await loadMatches();
  await loadStandings('epl');
  startLivePolling();
  renderLeaderboard();
  initChatChips();
});

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => t.classList.remove('show'), 3500);
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-section').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));
  if (tab === 'live') loadLive();
  if (tab === 'leaderboard') renderLeaderboard();
}

// ── Matches ───────────────────────────────────────────────────────────────────
async function loadMatches() {
  const grid = document.getElementById('matchGrid');
  grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading fixtures...</p></div>';

  try {
    const params = { status: 'upcoming', limit: 20 };
    if (currentLeague !== 'all') params.league = currentLeague;
    const { matches } = await api.getMatches(params);
    currentMatches = matches;
    renderMatches(matches);
  } catch (err) {
    grid.innerHTML = `<div class="error-state">⚠️ ${err.message}</div>`;
  }
}

function renderMatches(matches) {
  const grid = document.getElementById('matchGrid');
  if (!matches.length) {
    grid.innerHTML = '<div class="empty-state">No upcoming matches found.</div>';
    return;
  }
  grid.innerHTML = matches.map(m => {
    const kd = new Date(m.kickoff);
    const timeStr = kd.toLocaleString('en-GB', { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const hasPred = m.aiPrediction;
    return `
      <div class="match-card ${selectedMatchId === m._id ? 'selected' : ''}" onclick="selectMatch('${m._id}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')selectMatch('${m._id}')">
        <div class="match-card-meta">
          <span class="league-tag ${m.league}">${m.leagueName}</span>
          <span class="kickoff-time">${timeStr}</span>
          ${hasPred ? '<span class="pred-badge">✓ Predicted</span>' : ''}
        </div>
        <div class="match-teams-row">
          <div class="team-info">
            ${m.homeTeamLogo ? `<img src="${m.homeTeamLogo}" class="team-logo" alt="${m.homeTeam}" onerror="this.style.display='none'">` : `<div class="team-badge-fallback">${m.homeTeam[0]}</div>`}
            <span class="team-name">${m.homeTeam}</span>
          </div>
          <span class="vs-badge">VS</span>
          <div class="team-info reverse">
            ${m.awayTeamLogo ? `<img src="${m.awayTeamLogo}" class="team-logo" alt="${m.awayTeam}" onerror="this.style.display='none'">` : `<div class="team-badge-fallback">${m.awayTeam[0]}</div>`}
            <span class="team-name">${m.awayTeam}</span>
          </div>
        </div>
        ${m.odds?.home ? `
        <div class="odds-row">
          <div class="odd-pill"><span class="odd-l">1</span><span class="odd-v">${m.odds.home.toFixed(2)}</span></div>
          <div class="odd-pill"><span class="odd-l">X</span><span class="odd-v">${m.odds.draw.toFixed(2)}</span></div>
          <div class="odd-pill"><span class="odd-l">2</span><span class="odd-v">${m.odds.away.toFixed(2)}</span></div>
        </div>` : ''}
      </div>`;
  }).join('');
}

function selectMatch(id) {
  selectedMatchId = id;
  document.getElementById('predPanel').classList.remove('visible');
  renderMatches(currentMatches);
}

function filterLeague(btn, league) {
  currentLeague = league;
  document.querySelectorAll('.league-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  loadMatches();
}

// ── AI Prediction ─────────────────────────────────────────────────────────────
async function runPrediction() {
  if (!selectedMatchId) return showToast('Please select a match first.', 'warn');

  const btn = document.getElementById('predictBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-sm"></span> Analysing...';

  const panel = document.getElementById('predPanel');
  panel.classList.remove('visible');

  try {
    const { prediction, cached } = await api.predict(selectedMatchId);
    renderPrediction(prediction, cached);
    panel.classList.add('visible');
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (!cached) showToast('AI prediction generated! ⚽', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '🧠 Generate AI Prediction';
  }
}

function renderPrediction(p, cached) {
  const match = currentMatches.find(m => m._id === selectedMatchId || m._id === p.match);
  const matchLabel = match ? `${match.homeTeam} vs ${match.awayTeam}` : 'Selected Match';
  const winnerLabel = p.winner === 'home' ? match?.homeTeam : p.winner === 'away' ? match?.awayTeam : 'Draw';

  document.getElementById('predMatchLabel').innerHTML = `<strong>${matchLabel}</strong>${cached ? ' <span class="cache-badge">cached</span>' : ''}`;

  document.getElementById('probBarsContainer').innerHTML = `
    <div class="prob-row">
      <span class="prob-label">${match?.homeTeam || 'Home'}</span>
      <div class="prob-track"><div class="prob-bar home" style="width:${p.probHome}%"></div></div>
      <span class="prob-val home-col">${p.probHome}%</span>
    </div>
    <div class="prob-row">
      <span class="prob-label">Draw</span>
      <div class="prob-track"><div class="prob-bar draw" style="width:${p.probDraw}%"></div></div>
      <span class="prob-val draw-col">${p.probDraw}%</span>
    </div>
    <div class="prob-row">
      <span class="prob-label">${match?.awayTeam || 'Away'}</span>
      <div class="prob-track"><div class="prob-bar away" style="width:${p.probAway}%"></div></div>
      <span class="prob-val away-col">${p.probAway}%</span>
    </div>
  `;

  document.getElementById('verdictContent').innerHTML = `
    <div class="verdict-winner">🏆 Prediction: <strong>${winnerLabel}</strong></div>
    <p class="verdict-text">${p.verdict}</p>
  `;

  document.getElementById('keyStatsGrid').innerHTML = `
    <div class="stat-tile"><div class="stat-tile-label">xG Home</div><div class="stat-tile-val">${p.xgHome?.toFixed(1) || '—'}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">xG Away</div><div class="stat-tile-val">${p.xgAway?.toFixed(1) || '—'}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">BTTS</div><div class="stat-tile-val">${p.btts}%</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Over 2.5</div><div class="stat-tile-val">${p.over25}%</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Score</div><div class="stat-tile-val">${p.scoreline || '—'}</div></div>
    <div class="stat-tile"><div class="stat-tile-label">Confidence</div><div class="stat-tile-val conf-val">${p.confidence}%</div></div>
  `;

  document.getElementById('confBarFill').style.width = `${p.confidence}%`;
  document.getElementById('confLabel').textContent = `${p.confidence}%`;

  // Save button
  const saveBtn = document.getElementById('savePredBtn');
  if (Auth.getUser()) {
    saveBtn.style.display = '';
    saveBtn.onclick = () => savePrediction(p._id);
  } else {
    saveBtn.style.display = 'none';
  }
}

async function savePrediction(predId) {
  try {
    await api.savePrediction(predId);
    showToast('Prediction saved to your profile!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── Live Scores ───────────────────────────────────────────────────────────────
async function loadLive() {
  const el = document.getElementById('liveGrid');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Checking live games...</p></div>';
  try {
    const { matches } = await api.getLive();
    if (!matches.length) {
      el.innerHTML = '<div class="empty-state">🟡 No live matches right now.<br><small>Check back during match times.</small></div>';
      return;
    }
    el.innerHTML = matches.map(m => `
      <div class="live-card">
        <div class="live-badge">● LIVE</div>
        <div class="live-teams">
          <span>${m.homeTeam}</span>
          <span class="live-score">${m.score.home ?? 0} – ${m.score.away ?? 0}</span>
          <span>${m.awayTeam}</span>
        </div>
        <div class="live-league">${m.leagueName}</div>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div class="error-state">⚠️ ${err.message}</div>`;
  }
}

function startLivePolling() {
  livePollingInterval = setInterval(() => {
    if (document.getElementById('tab-live')?.classList.contains('active')) loadLive();
  }, 60000);
}

// ── Standings ─────────────────────────────────────────────────────────────────
async function loadStandings(league) {
  document.querySelectorAll('.standings-league-btn').forEach(b => b.classList.toggle('active', b.dataset.league === league));
  const tbody = document.getElementById('standingsBody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading-cell"><div class="spinner"></div></td></tr>';
  try {
    const { standing } = await api.getStandings(league);
    renderStandingsTable(standing.table);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="error-cell">⚠️ ${err.message}</td></tr>`;
  }
}

function renderStandingsTable(table) {
  const tbody = document.getElementById('standingsBody');
  tbody.innerHTML = (table || []).map(row => {
    const posClass = row.position <= 4 ? 'pos-ucl' : row.position <= 6 ? 'pos-uel' : row.position >= 18 ? 'pos-rel' : '';
    const form = (row.form || '').split('').slice(-5).map(f =>
      `<span class="form-pip ${f.toLowerCase() === 'w' ? 'w' : f.toLowerCase() === 'd' ? 'd' : 'l'}"></span>`
    ).join('');
    return `
      <tr>
        <td class="pos-cell ${posClass}">${row.position}</td>
        <td class="club-cell">${row.teamLogo ? `<img src="${row.teamLogo}" class="standings-logo" alt="${row.team}" onerror="this.style.display='none'">` : ''}<span>${row.team}</span></td>
        <td>${row.played}</td>
        <td class="won">${row.won}</td>
        <td class="drawn">${row.drawn}</td>
        <td class="lost">${row.lost}</td>
        <td class="${row.gd >= 0 ? 'gd-pos' : 'gd-neg'}">${row.gd >= 0 ? '+' : ''}${row.gd}</td>
        <td class="points">${row.points}</td>
        <td><div class="form-pips">${form}</div></td>
      </tr>`;
  }).join('');
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
async function renderLeaderboard() {
  const el = document.getElementById('leaderboardList');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const { leaderboard } = await api.leaderboard();
    if (!leaderboard.length) { el.innerHTML = '<div class="empty-state">No entries yet. Be the first!</div>'; return; }
    el.innerHTML = leaderboard.map((u, i) => `
      <div class="leader-row ${i < 3 ? 'top-' + (i+1) : ''}">
        <span class="leader-pos">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
        <span class="leader-avatar">${u.username[0].toUpperCase()}</span>
        <span class="leader-name">${u.username}</span>
        <span class="leader-acc">${u.stats.predictionsTotal ? Math.round((u.stats.predictionsCorrect / u.stats.predictionsTotal) * 100) : 0}% acc</span>
        <span class="leader-pts">${u.stats.points} pts</span>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<div class="error-state">⚠️ ${err.message}</div>`;
  }
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function initChatChips() {
  document.getElementById('chatChips').querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('chatInput').value = chip.textContent;
      sendChatMessage();
    });
  });
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  appendChatMsg('user', text);
  chatHistory.push({ role: 'user', content: text });

  const dotsId = appendChatDots();

  try {
    const { reply } = await api.chat(chatHistory.slice(-10));
    removeChatDots(dotsId);
    appendChatMsg('ai', reply);
    chatHistory.push({ role: 'assistant', content: reply });
  } catch (err) {
    removeChatDots(dotsId);
    appendChatMsg('ai', `Sorry, I'm having trouble right now. (${err.message})`);
  }
}

function appendChatMsg(role, text) {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.innerHTML = `
    ${role === 'ai' ? '<span class="chat-sender">GoalIQ AI</span>' : ''}
    <div class="chat-bubble">${text}</div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function appendChatDots() {
  const msgs = document.getElementById('chatMessages');
  const id = 'dots-' + Date.now();
  const div = document.createElement('div');
  div.className = 'chat-msg ai';
  div.id = id;
  div.innerHTML = `<span class="chat-sender">GoalIQ AI</span><div class="chat-bubble dots-bubble"><span></span><span></span><span></span></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return id;
}

function removeChatDots(id) {
  document.getElementById(id)?.remove();
}
