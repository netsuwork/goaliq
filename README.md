# ⚽ GoalIQ — AI Football Prediction Platform

A full-stack football prediction website powered by Claude AI.

---

## 📁 Project Structure

```
goaliq/
├── backend/                  # Node.js + Express API
│   ├── server.js             # Entry point
│   ├── .env.example          # Environment variable template
│   ├── models/
│   │   ├── User.js           # User accounts & stats
│   │   ├── Match.js          # Football fixtures
│   │   ├── Prediction.js     # AI predictions
│   │   └── Standing.js       # League tables
│   ├── routes/
│   │   ├── auth.js           # Register / login / me
│   │   ├── matches.js        # Fixture CRUD
│   │   ├── predictions.js    # AI prediction generation
│   │   ├── standings.js      # League standings
│   │   ├── chat.js           # AI chat endpoint
│   │   └── users.js          # Profiles & leaderboard
│   ├── middleware/
│   │   └── auth.js           # JWT protection
│   └── services/
│       ├── aiService.js      # Anthropic Claude integration
│       └── footballSync.js   # Live data sync (api-football.com)
│
└── frontend/                 # Vanilla HTML/CSS/JS
    └── public/
        ├── index.html        # Single-page app
        ├── css/style.css     # Full stylesheet
        └── js/
            ├── api.js        # API client
            ├── auth.js       # Auth state & modal
            └── app.js        # Main app logic
```

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` and fill in:
- `MONGODB_URI` — MongoDB connection string
- `JWT_SECRET` — any long random string
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com
- `FOOTBALL_API_KEY` — from https://api-football.com (free tier)

```bash
npm run dev      # Development (nodemon)
npm start        # Production
```

Backend runs on **http://localhost:5000**

### 2. Frontend Setup

```bash
cd frontend
npm run serve    # or: python3 -m http.server 3000 --directory public
```

Frontend runs on **http://localhost:3000**

> **Note:** The app works without a Football API key — it seeds demo match data automatically.

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint              | Description         |
|--------|-----------------------|---------------------|
| POST   | `/api/auth/register`  | Create account      |
| POST   | `/api/auth/login`     | Login               |
| GET    | `/api/auth/me`        | Get current user    |

### Matches
| Method | Endpoint                  | Description               |
|--------|---------------------------|---------------------------|
| GET    | `/api/matches`            | List fixtures             |
| GET    | `/api/matches/live`       | Live scores               |
| GET    | `/api/matches/:id`        | Single match              |

### Predictions
| Method | Endpoint                           | Description            |
|--------|------------------------------------|------------------------|
| POST   | `/api/predictions/generate/:id`    | Generate AI prediction |
| GET    | `/api/predictions`                 | List predictions       |
| POST   | `/api/predictions/save/:id`        | Save to profile        |

### Standings
| Method | Endpoint                  | Description           |
|--------|---------------------------|-----------------------|
| GET    | `/api/standings/:league`  | Get league table      |

### Chat
| Method | Endpoint     | Description       |
|--------|--------------|-------------------|
| POST   | `/api/chat`  | AI chat message   |

### Users
| Method | Endpoint                      | Description        |
|--------|-------------------------------|--------------------|
| GET    | `/api/users/leaderboard`      | Top predictors     |
| GET    | `/api/users/me/saved-predictions` | Saved picks   |
| PATCH  | `/api/users/me`               | Update profile     |

---

## 🌍 Deployment

### Backend — Railway / Render / Fly.io
1. Set all environment variables in dashboard
2. Set start command: `node server.js`
3. Set `FRONTEND_URL` to your deployed frontend URL

### Frontend — Vercel / Netlify / GitHub Pages
1. Point to `frontend/public` as root
2. Update `API_BASE` in `public/js/api.js` to your backend URL

### MongoDB
- Free cluster at https://mongodb.com/atlas

---

## ✨ Features

- 🧠 **AI Match Predictions** — Win probabilities, xG, BTTS, scoreline via Claude
- 💬 **AI Chat** — Ask anything about football
- 📊 **League Standings** — Live tables with form guide
- 🔴 **Live Scores** — Real-time match updates (with Football API)
- 🏅 **Leaderboard** — Track prediction accuracy
- 🔐 **Auth** — JWT-based user accounts
- ⚡ **Auto-sync** — Cron jobs keep data fresh
- 🔒 **Rate Limiting** — Protects AI endpoints
- 📱 **Responsive** — Works on mobile & desktop

---

## 🔑 Environment Variables Reference

| Variable             | Required | Description                        |
|----------------------|----------|------------------------------------|
| `PORT`               | No       | Server port (default 5000)         |
| `MONGODB_URI`        | Yes      | MongoDB connection string          |
| `JWT_SECRET`         | Yes      | Secret for signing tokens          |
| `ANTHROPIC_API_KEY`  | Yes      | Anthropic Claude API key           |
| `FOOTBALL_API_KEY`   | No       | api-football.com key (demo without)|
| `FRONTEND_URL`       | No       | Frontend URL for CORS              |

---

*Predictions are for entertainment only. Not betting advice.*
