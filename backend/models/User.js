const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  anonymousId: { type: String, unique: true, sparse: true },
  nickname:    { type: String, unique: true, sparse: true, default: null },
  email:       { type: String, sparse: true },
  googleId:    { type: String, sparse: true, index: true },
  photoUrl:    { type: String },
  password:    { type: String },                              // Only for admin (hashed)
  role:        { type: String, enum: ['user', 'admin'], default: 'user' },
  interests:   { type: [String], default: [] },  // User-selected interest tags (e.g. 'politics', 'technology', etc.)
  onboardingComplete: { type: Boolean, default: false }, // True after nickname + interests are set
  pushToken:   { type: String }, // For Expo Push Notifications
  isSeller:    { type: Boolean, default: false },
  isSellerSuspended: { type: Boolean, default: false },
  sellerSuspendedAt: { type: Date, default: null },
  sellerSuspendedReason: { type: String, default: null },
  shopName:            { type: String, default: null },
  sellerPhone:         { type: String, default: null },
  shopLocation:        { type: String, default: '' },
  shopImage:           { type: String, default: '' },
  shopDetailsComplete: { type: Boolean, default: false },
  lastActive:  { type: Date, default: Date.now },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
