require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cron = require('node-cron');
 
const authRoutes       = require('./routes/auth');
const matchRoutes      = require('./routes/matches');
const predictionRoutes = require('./routes/predictions');
const standingsRoutes  = require('./routes/standings');
const chatRoutes       = require('./routes/chat');
const userRoutes       = require('./routes/users');
const teamRoutes = require('./routes/teams');
const { syncMatches, syncStandings, syncLive } = require('./services/footballSync');
 
const app = express();
const PORT = process.env.PORT || 5000;
 
// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
 
const limiter = rateLimit({ 
  windowMs: 15 * 60 * 1000, 
  max: 300,
  validate: { xForwardedForHeader: false }
});
app.use('/api/', limiter);
const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
app.use('/api/predictions', aiLimiter);
app.use('/api/chat', aiLimiter);
 
// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/matches',     matchRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/standings',   standingsRoutes);
app.use('/api/chat',        chatRoutes);
app.use('/api/users',       userRoutes);
 
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});
 
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
 
// ── Database & Startup ────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
 
    app.listen(PORT, () => {
      console.log('🚀 GoalIQ API running on port ' + PORT);
    });
 
    // Sync all data on startup
    console.log('🌱 Starting initial data sync...');
    await syncMatches();
    await syncStandings();
    console.log('✅ Initial sync complete');
 
    // Live scores every 60 seconds
    cron.schedule('* * * * *', async () => {
      await syncLive().catch(console.error);
    });
 
    // Full match sync every 2 hours
    cron.schedule('0 */2 * * *', async () => {
      console.log('⏰ Running scheduled match sync...');
      await syncMatches().catch(console.error);
    });
 
    // Standings sync every 3 hours
    cron.schedule('0 */3 * * *', async () => {
      console.log('⏰ Running scheduled standings sync...');
      await syncStandings().catch(console.error);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
 
module.exports = app;
