const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  sellerId:    { type: String, required: true, index: true },  // anonymousId of seller
  sellerName:  { type: String, required: true },
  sellerPhone: { type: String },
  sellerLocation: { type: String, default: '' },
  category:    { type: String, required: true, index: true },  // e.g. 'Fashion', 'FMCG', 'Electronics', 'Grocery'
  name:        { type: String, required: true },
  description: { type: String, default: '' },
  price:       { type: Number, required: true },
  images:      { type: [String], default: [] },                // base64 or URLs
  isApproved:  { type: Boolean, default: true },               // auto-approved for now
  isActive:    { type: Boolean, default: true },
  createdAt:   { type: Date, default: Date.now },
  liveAt:      { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) }, // goes live 10 min after creation
});

// Compound indexes for blazing fast feed & category queries
productSchema.index({ category: 1, isActive: 1, isApproved: 1, createdAt: -1 });
productSchema.index({ isActive: 1, isApproved: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);

