const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  anonymousId:   { type: String },
  nickname:      { type: String },
  content:       { type: String, required: true, maxLength: 1000 },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }  // [longitude, latitude]
  },
  views:         { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  status:        { type: String, enum: ['active', 'deleted', 'reported'], default: 'active' },
  locationName:  { type: String, default: '' },
  createdAt:     { type: Date, default: Date.now },
  editedAt:      { type: Date, default: null }
});

postSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Post', postSchema);
