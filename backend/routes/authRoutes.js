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
      if (!user.nickname) {
        user.nickname = await generateUniqueNickname(requestedNickname);
        user.lastActive = Date.now();
        await user.save();
        return res.status(201).json({ nickname: user.nickname, anonymousId: user.anonymousId });
      } else {
        user.lastActive = Date.now();
        await user.save();
        return res.json({ nickname: user.nickname, anonymousId: user.anonymousId });
      }
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

// POST /api/auth/google — Google Sign-In & Account Restoration
router.post('/google', async (req, res) => {
  try {
    const { email, googleId, name, photoUrl, currentAnonymousId } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Check if user already exists with this email or googleId
    let user = await User.findOne({
      $or: [
        { email: cleanEmail },
        ...(googleId ? [{ googleId }] : [])
      ]
    });

    if (user) {
      // Existing User! Restore their account data so they never lose chats, groups or posts
      user.lastActive = Date.now();
      if (googleId && !user.googleId) user.googleId = googleId;
      if (photoUrl && !user.photoUrl) user.photoUrl = photoUrl;
      await user.save();

      return res.json({
        isNewUser: false,
        anonymousId: user.anonymousId,
        nickname: user.nickname,
        email: user.email,
        photoUrl: user.photoUrl,
        createdAt: user.createdAt,
      });
    }

    // 2. New User Registration:
    // Generate a unique anonymous nickname automatically (e.g. NovaFalcon82, StarRunner14)
    const baseNickname = name ? name.replace(/[^a-zA-Z0-9_]/g, '').trim().substring(0, 12) : '';
    const nickname = await generateUniqueNickname(baseNickname);

    // Assign anonymousId: either reuse current if unclaimed or generate unique new one
    let assignedAnonymousId = currentAnonymousId;
    if (assignedAnonymousId) {
      const existingWithId = await User.findOne({ anonymousId: assignedAnonymousId });
      if (existingWithId) {
        assignedAnonymousId = 'anon_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      }
    } else {
      assignedAnonymousId = 'anon_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    }

    user = new User({
      anonymousId: assignedAnonymousId,
      nickname,
      email: cleanEmail,
      googleId: googleId || null,
      photoUrl: photoUrl || null,
      role: 'user',
      lastActive: Date.now(),
      createdAt: Date.now()
    });

    await user.save();

    return res.status(201).json({
      isNewUser: true,
      anonymousId: user.anonymousId,
      nickname: user.nickname,
      email: user.email,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('Error in /api/auth/google:', err);
    res.status(500).json({ error: 'Server error during Google authentication' });
  }
});

// PUT /api/auth/nickname — Update user nickname
router.put('/nickname', async (req, res) => {
  try {
    const { anonymousId, newNickname } = req.body;
    if (!anonymousId || !newNickname?.trim()) {
      return res.status(400).json({ error: 'anonymousId and newNickname are required' });
    }

    const cleanNickname = newNickname.trim();
    if (cleanNickname.length < 2 || cleanNickname.length > 25) {
      return res.status(400).json({ error: 'Nickname must be between 2 and 25 characters.' });
    }

    // Check if nickname already taken
    const existing = await User.findOne({ nickname: cleanNickname, anonymousId: { $ne: anonymousId } });
    if (existing) {
      return res.status(400).json({ error: 'Nickname is already taken. Please choose another.' });
    }

    const user = await User.findOneAndUpdate(
      { anonymousId },
      { nickname: cleanNickname, lastActive: Date.now() },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ nickname: user.nickname, anonymousId: user.anonymousId });
  } catch (err) {
    console.error('Error in PUT /api/auth/nickname:', err);
    res.status(500).json({ error: 'Server error updating nickname' });
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
