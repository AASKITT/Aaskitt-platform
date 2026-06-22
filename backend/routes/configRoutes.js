const express = require('express');
const router = express.Router();
const AppConfig = require('../models/AppConfig');

// GET /api/config
router.get('/', async (req, res) => {
  try {
    let config = await AppConfig.findOne();
    if (!config) {
      config = new AppConfig();
      await config.save();
    }
    res.json({
      minRequiredVersion: config.minRequiredVersion,
      playStoreUrl: config.playStoreUrl
    });
  } catch (err) {
    console.error('Error fetching config:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
