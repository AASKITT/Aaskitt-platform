const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true }, // anonymousId of the receiver
  senderNickname: { type: String, required: true }, // who did the action
  type: { type: String, enum: ['comment', 'reply', 'post_created', 'chat_request', 'chat_accepted', 'new_message', 'member_joined', 'group_joined'], required: true }, // type of notification
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' }, // Optional for chat
  groupId: { type: String }, // Optional, for community group messages
  chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRequest' }, // Optional for post
  text: { type: String }, // Optional snippet of message or request
  commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }, // Optional, for replies
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Notification', notificationSchema);
