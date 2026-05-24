const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  minute:    Number,
  extraTime: Number,
  team:      String,
  teamId:    Number,
  scorer:    String,
  assist:    String,
  type:      { type: String, default: 'REGULAR' },
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  minute: Number,
  team:   String,
  player: String,
  card:   String,
}, { _id: false });

const subSchema = new mongoose.Schema({
  minute:    Number,
  team:      String,
  playerOut: String,
  playerIn:  String,
}, { _id: false });

const playerSchema = new mongoose.Schema({
  name:        String,
  position:    String,
  shirtNumber: Number,
}, { _id: false });

const lineupSchema = new mongoose.Schema({
  formation: String,
  startXI:   [playerSchema],
  bench:     [playerSchema],
}, { _id: false });

const matchSchema = new mongoose.Schema({
  externalId:    { type: String, unique: true, index: true },
  afFixtureId:   Number,
  league:        { type: String, index: true },
  leagueName:    String,
  season:        String,
  matchday:      Number,
  round:         String,
  homeTeam:      String,
  awayTeam:      String,
  homeTeamId:    Number,
  awayTeamId:    Number,
  homeTeamLogo:  String,
  awayTeamLogo:  String,
  kickoff:       { type: Date, index: true },
  status:        { type: String, index: true, default: 'upcoming' },
  score: {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  halfTimeScore: {
    home: { type: Number, default: null },
    away: { type: Number, default: null },
  },
  referee:       String,
  venue:         String,
  goals:         [goalSchema],
  bookings:      [bookingSchema],
  substitutions: [subSchema],
  homeFormation: String,
  awayFormation: String,
  homeLineup:    lineupSchema,
  awayLineup:    lineupSchema,
  aiPrediction:  { type: mongoose.Schema.Types.ObjectId, ref: 'Prediction' },
  stats: {
    homeForm:             String,
    awayForm:             String,
    homeGoalsAvg:         Number,
    awayGoalsAvg:         Number,
    homeGoalsConcededAvg: Number,
    awayGoalsConcededAvg: Number,
    h2hHomeWins:          Number,
    h2hAwayWins:          Number,
    h2hDraws:             Number,
  },
}, { timestamps: true });

module.exports = mongoose.models.Match || mongoose.model('Match', matchSchema);
