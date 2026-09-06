const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRequest', required: true },
  fromAnonymousId: { type: String, required: true },
  text:            { type: String, default: '', maxlength: 1000 },
  images:          { type: [String], default: [] },
  read:            { type: Boolean, default: false },
}, { timestamps: true });

messageSchema.index({ chatRequestId: 1, createdAt: 1 });
// Auto-delete messages after 24 hours (86400 seconds)
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Message', messageSchema);
