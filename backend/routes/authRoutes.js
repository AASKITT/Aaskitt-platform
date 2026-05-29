const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateUniqueNickname } = require('../utils/nickname');

// POST /api/auth/anonymous
router.post('/anonymous', async (req, res) => {
  try {
    const { anonymousId, requestedNickname } = req.body;
    
    if (!anonymousId || !requestedNickname) {
      return res.status(400).json({ error: 'anonymousId and requestedNickname are required' });
    }

    let user = await User.findOne({ anonymousId });
    if (user) {
      user.lastActive = Date.now();
      await user.save();
      return res.json({ nickname: user.nickname, anonymousId: user.anonymousId });
    }

    const nickname = await generateUniqueNickname(requestedNickname);
    user = new User({
      anonymousId,
      nickname
    });
    
    await user.save();
    res.status(201).json({ nickname: user.nickname, anonymousId: user.anonymousId });
  } catch (err) {
    console.error('Error in /anonymous:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/ping
router.post('/ping', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    if (!anonymousId) {
      return res.status(400).json({ error: 'anonymousId is required' });
    }

    await User.updateOne({ anonymousId }, { lastActive: Date.now() });
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /ping:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
