const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Group = require('../models/Group');
const CommunityMessage = require('../models/CommunityMessage');
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

    const [
      totalUsers,
      activeUsersToday,
      googleUsersCount,
      guestUsersCount,
      namedUsersCount,
      pendingNicknameCount,
      totalPosts,
      activePosts,
      totalComments,
      postsToday
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', lastActive: { $gte: today } }),
      User.countDocuments({ role: 'user', $or: [{ googleId: { $exists: true, $ne: null } }, { email: { $exists: true, $ne: null } }] }),
      User.countDocuments({ role: 'user', googleId: { $in: [null, undefined] }, email: { $in: [null, undefined] } }),
      User.countDocuments({ role: 'user', nickname: { $exists: true, $ne: null } }),
      User.countDocuments({ role: 'user', nickname: { $in: [null, undefined] } }),
      Post.countDocuments(),
      Post.countDocuments({ status: 'active' }),
      Comment.countDocuments(),
      Post.countDocuments({ createdAt: { $gte: today } })
    ]);

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
      googleUsersCount,
      guestUsersCount,
      namedUsersCount,
      pendingNicknameCount,
      totalPosts,
      activePosts,
      totalComments,
      postsToday,
      onlineCount,
      recentActivity
    });
  } catch (err) {
    console.error('Error in dashboard-stats:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users
router.get('/users', [auth, admin], async (req, res) => {
  try {
    const { search, type } = req.query;
    let query = { role: 'user' };

    if (search && search.trim()) {
      const term = search.trim();
      query.$or = [
        { nickname: { $regex: term, $options: 'i' } },
        { anonymousId: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } }
      ];
    }

    if (type === 'google') {
      query.$or = [{ googleId: { $exists: true, $ne: null } }, { email: { $exists: true, $ne: null } }];
    } else if (type === 'guest') {
      query.googleId = { $in: [null, undefined] };
      query.email = { $in: [null, undefined] };
    } else if (type === 'named') {
      query.nickname = { $exists: true, $ne: null };
    } else if (type === 'pending_nickname') {
      query.nickname = { $in: [null, undefined] };
    }

    const rawUsers = await User.find(query).sort({ createdAt: -1 }).limit(150);
    
    const users = rawUsers.map(u => ({
      _id: u._id,
      id: u._id,
      anonymousId: u.anonymousId,
      nickname: u.nickname || 'Pending Setup',
      rawNickname: u.nickname || null,
      email: u.email || 'N/A',
      photoUrl: u.photoUrl || null,
      isGoogleLinked: !!(u.googleId || u.email),
      googleId: u.googleId || null,
      role: u.role,
      lastActive: u.lastActive,
      createdAt: u.createdAt,
    }));

    res.json(users);
  } catch (err) {
    console.error('Error in /api/admin/users:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', [auth, admin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [postsCount, commentsCount] = await Promise.all([
      Post.countDocuments({ anonymousId: user.anonymousId }),
      Comment.countDocuments({ anonymousId: user.anonymousId }),
    ]);

    res.json({
      ...user.toObject(),
      isGoogleLinked: !!(user.googleId || user.email),
      postsCount,
      commentsCount,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/users/:id — Edit user nickname or role
router.put('/users/:id', [auth, admin], async (req, res) => {
  try {
    const { nickname, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (nickname && nickname.trim() && nickname !== user.nickname) {
      const { generateUniqueNickname } = require('../utils/nickname');
      const uniqueNickname = await generateUniqueNickname(nickname.trim());
      user.nickname = uniqueNickname;

      // Update nickname in posts and comments
      await Promise.all([
        Post.updateMany({ anonymousId: user.anonymousId }, { nickname: uniqueNickname }).catch(() => {}),
        Comment.updateMany({ anonymousId: user.anonymousId }, { nickname: uniqueNickname }).catch(() => {}),
        CommunityMessage.updateMany({ anonymousId: user.anonymousId }, { nickname: uniqueNickname }).catch(() => {}),
      ]);
    }

    if (role && ['user', 'admin'].includes(role)) {
      user.role = role;
    }

    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    console.error('Admin user update error:', err);
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

    const Notification = require('../models/Notification');

    // Delete user's posts, comments, messages, notifications
    const userPosts = await Post.find({ anonymousId: user.anonymousId });
    for (let post of userPosts) {
      await Comment.deleteMany({ post: post._id });
      req.io.emit('postDeleted', post._id.toString());
    }
    await Promise.all([
      Post.deleteMany({ anonymousId: user.anonymousId }),
      Comment.deleteMany({ anonymousId: user.anonymousId }),
      CommunityMessage.deleteMany({ anonymousId: user.anonymousId }),
      Notification.deleteMany({ recipientId: user.anonymousId }),
      User.findByIdAndDelete(req.params.id)
    ]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/groups
router.get('/groups', [auth, admin], async (req, res) => {
  try {
    const groups = await Group.find().sort({ createdAt: -1 }).limit(100);
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/groups/:id
router.delete('/groups/:id', [auth, admin], async (req, res) => {
  try {
    await Group.findByIdAndDelete(req.params.id);
    await CommunityMessage.deleteMany({ groupId: req.params.id });
    if (req.io) {
      req.io.emit('groupDeleted', { groupId: req.params.id });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});
// GET /api/admin/groups/:id
router.get('/groups/:id', [auth, admin], async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const messages = await CommunityMessage.find({ groupId: req.params.id }).sort({ createdAt: -1 });
    res.json({ group, messages });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/groups/:id — super admin edits group details
router.put('/groups/:id', [auth, admin], async (req, res) => {
  try {
    const { name, rules, tags, dp } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (name !== undefined && name.trim()) group.name = name.trim();
    if (rules !== undefined) group.rules = rules.trim();
    if (tags !== undefined) group.tags = Array.isArray(tags) ? tags : [];
    if (dp !== undefined) group.dp = dp || null;

    await group.save();
    if (req.io) {
      req.io.emit('groupUpdated', { group });
    }
    res.json({ success: true, group });
  } catch (err) {
    console.error('Admin group update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/groups/:groupId/members/:userId
router.delete('/groups/:groupId/members/:userId', [auth, admin], async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = group.members.filter(m => m.anonymousId !== req.params.userId);
    await group.save();
    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/admin/groups/:groupId/messages/:msgId
router.delete('/groups/:groupId/messages/:msgId', [auth, admin], async (req, res) => {
  try {
    await CommunityMessage.findByIdAndDelete(req.params.msgId);
    if (req.io) {
      req.io.emit('communityMessageDeleted', { groupId: req.params.groupId, msgId: req.params.msgId });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/groups/:groupId/broadcast — admin sends message as "Team Aaskitt"
router.post('/groups/:groupId/broadcast', [auth, admin], async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Message text required' });

    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const msg = new CommunityMessage({
      groupId: req.params.groupId,
      anonymousId: 'team_aaskitt',
      nickname: 'Team Aaskitt',
      text: text.trim(),
      isAdminBroadcast: true,
    });
    await msg.save();

    // Emit real-time to all group members via socket (same event name app listens to)
    if (req.io) {
      req.io.emit('newCommunityMessage', { ...msg.toObject(), groupId: req.params.groupId });
    }

    // Send success response FIRST (fire-and-forget push below)
    res.status(201).json({ success: true, message: msg });

    // Push notification to all members — using Node https (no external dep needed)
    const tokens = group.members
      .filter(m => m.expoPushToken)
      .map(m => m.expoPushToken);

    if (tokens.length > 0) {
      const https = require('https');
      const payload = JSON.stringify(tokens.map(to => ({
        to,
        sound: 'default',
        title: '📢 Team Aaskitt',
        body: text.trim().slice(0, 80),
        data: { groupId: req.params.groupId },
      })));

      const options = {
        hostname: 'exp.host',
        path: '/--/api/v2/push/send',
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const pushReq = https.request(options, r => {
        r.on('data', () => {});
        r.on('end', () => {});
      });
      pushReq.on('error', err => console.error('Push error:', err));
      pushReq.write(payload);
      pushReq.end();
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: 'Server error' });
  }
});


// PUT /api/admin/groups/:groupId/kick-creator — remove creator from the group (admin override)
router.put('/groups/:groupId/kick-creator', [auth, admin], async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Remove creator from members list
    group.members = group.members.filter(m => m.anonymousId !== group.creatorId);
    await group.save();

    res.json({ success: true, group });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/groups/:groupId/transfer-admin — transfer group admin to another member
router.put('/groups/:groupId/transfer-admin', [auth, admin], async (req, res) => {
  try {
    const { newAdminId } = req.body;
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const targetMember = group.members.find(m => m.anonymousId === newAdminId);
    if (!targetMember) {
      return res.status(404).json({ error: 'Selected user is not a member of this group' });
    }

    group.creatorId = targetMember.anonymousId;
    group.creatorNickname = targetMember.nickname;
    await group.save();

    if (req.io) {
      req.io.emit('groupUpdated', { group });
    }

    res.json({ success: true, group });
  } catch (err) {
    console.error('Transfer admin error:', err);
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
