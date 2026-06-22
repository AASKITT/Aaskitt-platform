const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let adminUser = await User.findOne({ email });
    if (!adminUser) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      adminUser = new User({
        email,
        password: hashedPassword,
        nickname: 'SuperAdmin',
        role: 'admin'
      });
      await adminUser.save();
    }

    const payload = { id: adminUser.id };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.json({ token, user: { nickname: adminUser.nickname, role: adminUser.role, email: adminUser.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/dashboard-stats
router.get('/dashboard-stats', [auth, admin], async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalUsers = await User.countDocuments({ role: 'user' });
    const activeUsersToday = await User.countDocuments({ role: 'user', lastActive: { $gte: today } });
    const totalPosts = await Post.countDocuments();
    const activePosts = await Post.countDocuments({ status: 'active' });
    const totalComments = await Comment.countDocuments();
    const postsToday = await Post.countDocuments({ createdAt: { $gte: today } });

    // Calculate recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentActivity = await Post.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // req.io is available from server.js
    const onlineCount = req.io ? req.io.engine.clientsCount : 0;

    res.json({
      totalUsers,
      activeUsersToday,
      totalPosts,
      activePosts,
      totalComments,
      postsToday,
      onlineCount,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users
router.get('/users', [auth, admin], async (req, res) => {
  try {
    const { search } = req.query;
    let query = { role: 'user' };

    if (search) {
      query.$or = [
        { nickname: { $regex: search, $options: 'i' } },
        { anonymousId: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 }).limit(100);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/posts
router.get('/posts', [auth, admin], async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }).limit(100);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/posts/:id
router.delete('/posts/:id', [auth, admin], async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ post: req.params.id });
    req.io.emit('postDeleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', [auth, admin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Delete user's posts and comments
    const userPosts = await Post.find({ anonymousId: user.anonymousId });
    for (let post of userPosts) {
      await Comment.deleteMany({ post: post._id });
      req.io.emit('postDeleted', post._id.toString());
    }
    await Post.deleteMany({ anonymousId: user.anonymousId });
    await Comment.deleteMany({ anonymousId: user.anonymousId });
    
    await User.findByIdAndDelete(req.params.id);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/config
router.put('/config', [auth, admin], async (req, res) => {
  try {
    const AppConfig = require('../models/AppConfig');
    let config = await AppConfig.findOne();
    if (!config) {
      config = new AppConfig();
    }
    
    if (req.body.minRequiredVersion) config.minRequiredVersion = req.body.minRequiredVersion;
    if (req.body.playStoreUrl) config.playStoreUrl = req.body.playStoreUrl;

    await config.save();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
