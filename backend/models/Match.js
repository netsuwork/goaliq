const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  externalId:  { type: String, unique: true, sparse: true },
  league:      { type: String, required: true },
  leagueName:  { type: String, required: true },
  season:      { type: String, default: '2024/25' },
  round:       { type: String, default: '' },
  homeTeam:    { type: String, required: true },
  awayTeam:    { type: String, required: true },
  homeTeamLogo:{ type: String, default: '' },
  awayTeamLogo:{ type: String, default: '' },
  kickoff:     { type: Date, required: true },
  status:      { type: String, enum: ['upcoming','live','finished','postponed'], default: 'upcoming' },
  score: {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  odds: {
    home: { type: Number, default: null },
    draw: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  stats: {
    homeForm:    { type: String, default: '' },   // e.g. "WWDLW"
    awayForm:    { type: String, default: '' },
    h2h:         { type: String, default: '' },
    homeGoalsAvg:{ type: Number, default: 0 },
    awayGoalsAvg:{ type: Number, default: 0 },
    homeXG:      { type: Number, default: 0 },
    awayXG:      { type: Number, default: 0 },
  },
  aiPrediction: { type: mongoose.Schema.Types.ObjectId, ref: 'Prediction', default: null },
}, { timestamps: true });

matchSchema.index({ kickoff: 1, status: 1 });
matchSchema.index({ league: 1 });

module.exports = mongoose.model('Match', matchSchema);
