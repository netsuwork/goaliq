const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
  match:      { type: mongoose.Schema.Types.ObjectId, ref: 'Match', required: true },
  generatedBy:{ type: String, enum: ['ai', 'user'], default: 'ai' },
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Win probabilities (0–100)
  probHome:   { type: Number, required: true },
  probDraw:   { type: Number, required: true },
  probAway:   { type: Number, required: true },

  // AI verdict
  verdict:    { type: String, default: '' },
  winner:     { type: String, default: '' },   // "home" | "draw" | "away"
  confidence: { type: Number, default: 0 },    // 0–100

  // Key stats
  xgHome:     { type: Number, default: 0 },
  xgAway:     { type: Number, default: 0 },
  btts:       { type: Number, default: 0 },    // probability %
  over25:     { type: Number, default: 0 },    // probability %
  scoreline:  { type: String, default: '' },   // e.g. "2-1"

  // Outcome tracking
  outcome:    { type: String, enum: ['correct','incorrect','pending'], default: 'pending' },
}, { timestamps: true });

predictionSchema.index({ match: 1, generatedBy: 1 });
predictionSchema.index({ user: 1 });

module.exports = mongoose.model('Prediction', predictionSchema);
