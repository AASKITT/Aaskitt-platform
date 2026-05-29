const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  post:          { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  anonymousId:   { type: String },
  nickname:      { type: String },
  text:          { type: String, required: true, maxLength: 500 },
  parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
  createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.model('Comment', commentSchema);
