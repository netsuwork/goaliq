const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  minute:    { type: Number },
  extraTime: { type: Number, default: null },
  team:      { type: String },
  scorer:    { type: String },
  assist:    { type: String, default: null },
  type:      { type: String, default: 'REGULAR' }, // REGULAR, OWN_GOAL, PENALTY
}, { _id: false });

const matchSchema = new mongoose.Schema({
  externalId:   { type: String, unique: true, sparse: true },
  league:       { type: String, required: true },
  leagueName:   { type: String, required: true },
  season:       { type: String, default: '2024' },
  round:        { type: String, default: '' },
  matchday:     { type: Number, default: null },
  homeTeam:     { type: String, required: true },
  awayTeam:     { type: String, required: true },
  homeTeamId:   { type: Number, default: null },
  awayTeamId:   { type: Number, default: null },
  homeTeamLogo: { type: String, default: '' },
  awayTeamLogo: { type: String, default: '' },
  kickoff:      { type: Date, required: true },
  venue:        { type: String, default: '' },
  referee:      { type: String, default: '' },
  status:       { type: String, enum: ['upcoming','live','finished','postponed'], default: 'upcoming' },
  score: {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  goals:        { type: [goalSchema], default: [] },
  odds: {
    home: { type: Number, default: null },
    draw: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  stats: {
    homeForm:     { type: String, default: '' },
    awayForm:     { type: String, default: '' },
    homeGoalsAvg: { type: Number, default: 0 },
    awayGoalsAvg: { type: Number, default: 0 },
    homeXG:       { type: Number, default: 0 },
    awayXG:       { type: Number, default: 0 },
  },
  aiPrediction: { type: mongoose.Schema.Types.ObjectId, ref: 'Prediction', default: null },
}, { timestamps: true });

matchSchema.index({ kickoff: 1, status: 1 });
matchSchema.index({ league: 1, matchday: 1 });

module.exports = mongoose.model('Match', matchSchema);
