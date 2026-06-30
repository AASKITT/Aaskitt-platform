const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
  minRequiredVersion: { type: String, default: '1.0.0' },
  playStoreUrl: { type: String, default: 'market://details?id=com.aaskitt.original' }
});

module.exports = mongoose.model('AppConfig', appConfigSchema);
