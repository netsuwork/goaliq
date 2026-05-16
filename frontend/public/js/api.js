// GoalIQ API Client
const API_BASE = 'https://goaliq-api.onrender.com/api';

const api = {
  _token: localStorage.getItem('goaliq_token'),

  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  },

  async _fetch(path, opts = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: this._headers(),
      ...opts,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  setToken(token) {
    this._token = token;
    if (token) localStorage.setItem('goaliq_token', token);
    else localStorage.removeItem('goaliq_token');
  },

  // Auth
  register: (body) => api._fetch('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login:    (body) => api._fetch('/auth/login',    { method: 'POST', body: JSON.stringify(body) }),
  me:       ()     => api._fetch('/auth/me'),
  logout:   ()     => { api.setToken(null); },

  // Matches
  getMatches:  (params = {}) => api._fetch('/matches?' + new URLSearchParams(params)),
  getLive:     ()             => api._fetch('/matches/live'),
  getMatch:    (id)           => api._fetch(`/matches/${id}`),

  // Predictions
  predict:          (matchId) => api._fetch(`/predictions/generate/${matchId}`, { method: 'POST' }),
  getPredictions:   (params)  => api._fetch('/predictions?' + new URLSearchParams(params)),
  savePrediction:   (id)      => api._fetch(`/predictions/save/${id}`, { method: 'POST' }),
  mySaved:          ()        => api._fetch('/users/me/saved-predictions'),

  // Standings
  getStandings: (league) => api._fetch(`/standings/${league}`),

  // Chat
  chat: (messages, context) => api._fetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, context }),
  }),

  // Users
  leaderboard:   ()       => api._fetch('/users/leaderboard'),
  updateProfile: (body)   => api._fetch('/users/me', { method: 'PATCH', body: JSON.stringify(body) }),
};
