const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');

// GET /api/notifications/:anonymousId
router.get('/:anonymousId', async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.params.anonymousId })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(notifications);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/notifications/:anonymousId/unread-count
router.get('/:anonymousId/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipientId: req.params.anonymousId, isRead: false });
    res.json({ count });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/notifications/:anonymousId/read
router.put('/:anonymousId/read', async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientId: req.params.anonymousId, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking notifications as read:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/notifications/push-token
router.post('/push-token', async (req, res) => {
  const { anonymousId, pushToken } = req.body;
  if (!anonymousId || !pushToken) {
    return res.status(400).json({ error: 'Missing anonymousId or pushToken' });
  }

  try {
    await User.findOneAndUpdate(
      { anonymousId },
      { $set: { pushToken } },
      { new: true, upsert: true } // upsert if user doesn't exist yet? Better to just update if exists.
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving push token:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
