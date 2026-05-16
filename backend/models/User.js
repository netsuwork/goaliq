const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  avatar:   { type: String, default: '' },
  role:     { type: String, enum: ['user', 'admin'], default: 'user' },
  favouriteTeam: { type: String, default: '' },
  stats: {
    predictionsTotal: { type: Number, default: 0 },
    predictionsCorrect: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
  },
  savedPredictions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Prediction' }],
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
