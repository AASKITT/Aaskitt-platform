const mongoose = require('mongoose');

const communityMessageSchema = new mongoose.Schema({
  anonymousId: { type: String, required: true },
  nickname:    { type: String, required: true },
  text:        { type: String, default: '' },
  image:       { type: String, default: null },
  tag:         { type: String, default: null },   // selected tag when posting
  groupId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  replyTo:     { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityMessage', default: null },
  isAdminBroadcast: { type: Boolean, default: false },  // sent by Team Aaskitt admin
  edited:      { type: Boolean, default: false },
  commentsCount: { type: Number, default: 0 },
  views:       { type: Number, default: 0 },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [78.4867, 17.3850] }
  },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('CommunityMessage', communityMessageSchema);
