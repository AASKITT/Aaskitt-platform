const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  anonymousId:   { type: String, required: true },
  nickname:      { type: String, required: true },
  expoPushToken: { type: String, default: null },
  joinedAt:      { type: Date, default: Date.now },
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name:             { type: String, required: true, trim: true, maxlength: 60 },
  rules:            { type: String, default: '', maxlength: 500 },
  creatorId:        { type: String, required: true },
  creatorNickname:  { type: String, required: true },
  inviteCode:       { type: String, required: true, unique: true },
  members:          { type: [memberSchema], default: [] },
  bannedUsers:      { type: [String], default: [] },
  tags:             { type: [String], default: [] },   // mod-defined tags for posts
  dp:               { type: String, default: null },     // group display picture URL
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [78.4867, 17.3850] }
  },
  locationName:     { type: String, default: '' },
  createdAt:        { type: Date, default: Date.now }
});

module.exports = mongoose.model('Group', groupSchema);
