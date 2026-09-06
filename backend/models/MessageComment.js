const mongoose = require('mongoose');

const messageCommentSchema = new mongoose.Schema({
  messageId:    { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityMessage', required: true },
  anonymousId:  { type: String, required: true },
  nickname:     { type: String, required: true },
  text:         { type: String, required: true },
  parentComment:{ type: mongoose.Schema.Types.ObjectId, ref: 'MessageComment', default: null },
  createdAt:    { type: Date, default: Date.now }
});

module.exports = mongoose.model('MessageComment', messageCommentSchema);
