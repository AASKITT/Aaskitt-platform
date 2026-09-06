const mongoose = require('mongoose');

const chatRequestSchema = new mongoose.Schema({
  fromAnonymousId: { type: String, required: true },
  fromNickname:    { type: String, required: true },
  toAnonymousId:   { type: String, required: true },
  toNickname:      { type: String, required: true },
  postId:          { type: mongoose.Schema.Types.Mixed, required: false, default: 'general' },
  firstMessage:    { type: String, required: true, maxlength: 500 },
  status:          { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
}, { timestamps: true });

// Prevent duplicate pending requests from same sender to same receiver on same post
chatRequestSchema.index({ fromAnonymousId: 1, toAnonymousId: 1, postId: 1 }, { unique: true });

module.exports = mongoose.model('ChatRequest', chatRequestSchema);
