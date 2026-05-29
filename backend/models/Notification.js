const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true }, // anonymousId of the receiver
  senderNickname: { type: String, required: true }, // who did the action
  type: { type: String, enum: ['comment', 'reply'], required: true }, // type of notification
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }, // Optional, for replies
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
