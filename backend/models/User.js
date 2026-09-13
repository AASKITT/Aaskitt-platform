const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  anonymousId: { type: String, unique: true, sparse: true },
  nickname:    { type: String, unique: true, sparse: true, default: null },
  email:       { type: String, sparse: true },
  googleId:    { type: String, sparse: true, index: true },
  photoUrl:    { type: String },
  password:    { type: String },                              // Only for admin (hashed)
  role:        { type: String, enum: ['user', 'admin'], default: 'user' },
  pushToken:   { type: String }, // For Expo Push Notifications
  lastActive:  { type: Date, default: Date.now },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
