const mongoose = require('mongoose');

const standingSchema = new mongoose.Schema({
  league:    { type: String, required: true },
  leagueName:{ type: String, required: true },
  season:    { type: String, default: '2024/25' },
  updatedAt: { type: Date, default: Date.now },
  table: [
    {
      position:  Number,
      team:      String,
      teamLogo:  String,
      played:    Number,
      won:       Number,
      drawn:     Number,
      lost:      Number,
      gf:        Number,
      ga:        Number,
      gd:        Number,
      points:    Number,
      form:      String,   // "WWDLW"
    }
  ]
}, { timestamps: true });

standingSchema.index({ league: 1, season: 1 }, { unique: true });

module.exports = mongoose.model('Standing', standingSchema);
