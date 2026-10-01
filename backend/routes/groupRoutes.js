const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const CommunityMessage = require('../models/CommunityMessage');
const User = require('../models/User');
const Notification = require('../models/Notification');

// Cloudinary for group DP uploads
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper: generate short invite code
function generateCode(len = 7) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < len; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Helper: send push notifications to multiple tokens (uses built-in https, no external dep)
function sendPushToMany(tokens, title, body, data = {}) {
  if (!tokens || tokens.length === 0) return;
  const https = require('https');
  const payload = JSON.stringify(
    tokens.map(to => ({ to, sound: 'default', title, body, data }))
  );
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
  const req = https.request(options, res => {
    res.on('data', () => {});
    res.on('end', () => {});
  });
  req.on('error', err => console.error('Push error:', err));
  req.write(payload);
  req.end();
}

// GET /api/groups — list all groups (attached with latest post and sorted by activity)
router.get('/', async (req, res) => {
  try {
    const groups = await Group.aggregate([
      {
        $addFields: {
          memberCount: { $size: { $ifNull: ["$members", []] } }
        }
      },
      {
        $limit: 100
      }
    ]);

    const userLat = parseFloat(req.query.latitude);
    const userLng = parseFloat(req.query.longitude);
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371;

    // Attach latest message for each group
    const groupsWithLatestPost = await Promise.all(
      groups.map(async (group) => {
        let latestPost = null;
        const isNearbyGroup = group.name && group.name.trim().toLowerCase() === 'nearby';

        if (isNearbyGroup && !isNaN(userLat) && !isNaN(userLng)) {
          // Find recent messages in Nearby group and pick latest within 6km
          const recentMsgs = await CommunityMessage.find({ groupId: group._id })
            .sort({ createdAt: -1 })
            .limit(50);
          latestPost = recentMsgs.find(msg => {
            const coords = msg.location?.coordinates;
            if (!coords || !Array.isArray(coords) || coords.length < 2) return false;
            const dLat = toRad(coords[1] - userLat);
            const dLng = toRad(coords[0] - userLng);
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(userLat)) * Math.cos(toRad(coords[1])) * Math.sin(dLng / 2) ** 2;
            const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return distKm <= 6.0;
          }) || null;
        } else {
          latestPost = await CommunityMessage.findOne({ groupId: group._id })
            .sort({ createdAt: -1 });
        }

        return {
          ...group,
          latestPost: latestPost || null
        };
      })
    );

    // Sort: Nearby group ALWAYS on top, then groups with recent posts first, then group creation time
    groupsWithLatestPost.sort((a, b) => {
      const isNearbyA = a.name && a.name.trim().toLowerCase() === 'nearby';
      const isNearbyB = b.name && b.name.trim().toLowerCase() === 'nearby';
      if (isNearbyA && !isNearbyB) return -1;
      if (!isNearbyA && isNearbyB) return 1;

      const timeA = new Date(a.latestPost?.createdAt || a.createdAt).getTime();
      const timeB = new Date(b.latestPost?.createdAt || b.createdAt).getTime();
      return timeB - timeA;
    });

    res.json(groupsWithLatestPost);
  } catch (err) {
    console.error('Fetch groups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/upload-dp — upload group DP to Cloudinary
router.post('/upload-dp', async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ error: 'No image provided' });

    const result = await cloudinary.uploader.upload(base64, {
      folder: 'aaskitt_group_dp',
      transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
    });
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error('DP upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/groups/join/:code — find group by invite code
router.get('/join/:code', async (req, res) => {
  try {
    const group = await Group.findOne({ inviteCode: req.params.code });
    if (!group) return res.status(404).json({ error: 'Invalid invite code' });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/groups/:groupId — get single group info
router.get('/:groupId', async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups — create a new group (creator auto-joins)
router.post('/', async (req, res) => {
  try {
    const creatorId = req.body.creatorId || req.body.anonymousId;
    const creatorNickname = req.body.creatorNickname || req.body.nickname;
    const { name, rules, expoPushToken, tags, dp, latitude, longitude, locationName, location } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });
    if (!creatorId || !creatorNickname) return res.status(400).json({ error: 'Creator info required' });

    let inviteCode;
    let exists = true;
    while (exists) {
      inviteCode = generateCode();
      exists = await Group.findOne({ inviteCode });
    }

    // Clean + deduplicate tags (max 10, max 20 chars each)
    const cleanTags = Array.isArray(tags)
      ? [...new Set(tags.map(t => t.trim()).filter(t => t.length > 0 && t.length <= 20))].slice(0, 10)
      : [];

    let locationObj = null;
    if (latitude != null && longitude != null) {
      locationObj = { type: 'Point', coordinates: [Number(longitude), Number(latitude)] };
    } else if (location && Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
      locationObj = { type: 'Point', coordinates: [Number(location.coordinates[0]), Number(location.coordinates[1])] };
    }

    const group = new Group({
      name: name.trim(),
      rules: rules?.trim() || '',
      creatorId,
      creatorNickname,
      inviteCode,
      tags: cleanTags,
      dp: dp || null,
      location: locationObj,
      locationName: locationName || '',
      members: [{ anonymousId: creatorId, nickname: creatorNickname, expoPushToken: expoPushToken || null }],
    });
    await group.save();
    res.status(201).json(group);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:groupId/join — join a group
router.post('/:groupId/join', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { anonymousId, nickname, expoPushToken } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    if (group.bannedUsers.includes(anonymousId)) {
      return res.status(403).json({ error: 'You are banned from this group.' });
    }

    // Check if already a member
    const alreadyMember = group.members.some(m => m.anonymousId === anonymousId);
    if (alreadyMember) {
      // Update push token if changed
      const memberIndex = group.members.findIndex(m => m.anonymousId === anonymousId);
      if (expoPushToken && group.members[memberIndex].expoPushToken !== expoPushToken) {
        group.members[memberIndex].expoPushToken = expoPushToken;
        await group.save();
      }
      return res.json({ success: true, alreadyMember: true, group });
    }

    group.members.push({ anonymousId, nickname, expoPushToken: expoPushToken || null });
    await group.save();

    // Send notification + push notification to Group Admin if admin is not joining own group
    if (group.creatorId && group.creatorId !== anonymousId) {
      try {
        await Notification.create({
          recipientId: group.creatorId,
          senderNickname: nickname,
          type: 'member_joined',
          groupId: group._id.toString(),
          text: `joined your group "${group.name}"`,
        });

        // Push Notification to Admin
        const adminMember = group.members.find(m => m.anonymousId === group.creatorId);
        let adminPushToken = adminMember?.expoPushToken;
        if (!adminPushToken) {
          const adminUser = await User.findOne({ anonymousId: group.creatorId });
          adminPushToken = adminUser?.expoPushToken;
        }

        if (adminPushToken) {
          sendPushToMany(
            [adminPushToken],
            `New Group Member 🎉`,
            `${nickname} joined your group "${group.name}"!`,
            { groupId: group._id.toString(), type: 'member_joined' }
          );
        }

        // Real-time socket badge update
        if (req.io) {
          req.io.emit('newNotification', { recipientId: group.creatorId });
        }
      } catch (notifErr) {
        console.error('Group join notification error:', notifErr);
      }
    }

    res.json({ success: true, alreadyMember: false, group });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:groupId/leave — leave a group
router.post('/:groupId/leave', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { anonymousId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = group.members.filter(m => m.anonymousId !== anonymousId);
    await group.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/groups/:groupId/messages/:msgId — author or mod deletes a message
router.delete('/:groupId/messages/:msgId', async (req, res) => {
  try {
    const { groupId, msgId } = req.params;
    const requesterId = req.body.requesterId || req.body.anonymousId;

    const msg = await CommunityMessage.findById(msgId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    let canDelete = false;
    if (msg.anonymousId === requesterId || requesterId === 'team_aaskitt') {
      canDelete = true;
    } else if (groupId !== 'main') {
      const group = await Group.findById(groupId);
      if (group && group.creatorId === requesterId) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await CommunityMessage.findByIdAndDelete(msgId);
    if (req.io) {
      req.io.emit('communityMessageDeleted', { groupId, msgId });
    }
    res.json({ success: true, msgId });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/groups/:groupId/messages/:msgId — author edits their message
router.put('/:groupId/messages/:msgId', async (req, res) => {
  try {
    const { groupId, msgId } = req.params;
    const { requesterId, text, tag } = req.body;

    const msg = await CommunityMessage.findById(msgId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.anonymousId !== requesterId) {
      return res.status(403).json({ error: 'You can only edit your own messages' });
    }

    if (text !== undefined) msg.text = text.trim();
    if (tag !== undefined) msg.tag = tag || null;
    msg.edited = true;

    await msg.save();
    if (req.io) {
      req.io.emit('communityMessageUpdated', { groupId, message: msg });
    }
    res.json({ success: true, message: msg });
  } catch (err) {
    console.error('Edit message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/groups/:groupId — mod edits group details (name, rules, tags, dp)
router.put('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { requesterId, name, rules, tags, dp } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.creatorId !== requesterId) {
      return res.status(403).json({ error: 'Only group creator can edit this group' });
    }

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
    console.error('Group update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:groupId/ban — mod bans a user
router.post('/:groupId/ban', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { requesterId, targetId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.creatorId !== requesterId) return res.status(403).json({ error: 'Not mod' });
    if (group.bannedUsers.includes(targetId)) return res.json({ success: true, alreadyBanned: true });

    group.bannedUsers.push(targetId);
    // Remove from members too
    group.members = group.members.filter(m => m.anonymousId !== targetId);
    await group.save();

    req.io.to(`user_${targetId}`).emit('bannedFromGroup', { groupId, groupName: group.name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:groupId/unban
router.post('/:groupId/unban', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { requesterId, targetId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.creatorId !== requesterId) return res.status(403).json({ error: 'Not mod' });

    group.bannedUsers = group.bannedUsers.filter(id => id !== targetId);
    await group.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/groups/:groupId — mod deletes the whole group
router.delete('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { requesterId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.creatorId !== requesterId) return res.status(403).json({ error: 'Not mod' });

    await CommunityMessage.deleteMany({ groupId });
    await Group.findByIdAndDelete(groupId);

    req.io.emit('groupDeleted', { groupId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:groupId/transfer-admin — transfer group ownership to another member
router.post('/:groupId/transfer-admin', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { requesterId, targetId, targetNickname } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    if (group.creatorId !== requesterId && requesterId !== 'team_aaskitt') {
      return res.status(403).json({ error: 'Only current admin can transfer ownership' });
    }

    const newAdminMember = group.members.find(m => m.anonymousId === targetId);
    if (!newAdminMember) {
      return res.status(400).json({ error: 'Target user is not a member of this group' });
    }

    group.creatorId = targetId;
    group.creatorNickname = targetNickname || newAdminMember.nickname || 'Admin';
    await group.save();

    if (req.io) {
      req.io.emit('groupUpdated', { group });
      req.io.to(`user_${targetId}`).emit('adminTransferred', { groupId, groupName: group.name });
    }

    res.json({ success: true, group });
  } catch (err) {
    console.error('Transfer admin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── MESSAGE COMMENTS ────────────────────────────────────────────────────────

const MessageComment = require('../models/MessageComment');

// GET /api/groups/:groupId/messages/:msgId/comments
router.get('/:groupId/messages/:msgId/comments', async (req, res) => {
  try {
    const comments = await MessageComment.find({ messageId: req.params.msgId }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/groups/:groupId/messages/:msgId/comments
router.post('/:groupId/messages/:msgId/comments', async (req, res) => {
  try {
    const { groupId, msgId } = req.params;
    const { anonymousId, nickname, text, parentCommentId } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Comment text required' });

    const comment = new MessageComment({
      messageId: msgId,
      anonymousId,
      nickname,
      text: text.trim(),
      parentComment: parentCommentId || null,
    });
    await comment.save();

    // Increment commentsCount on the message
    await CommunityMessage.findByIdAndUpdate(msgId, { $inc: { commentsCount: 1 } });

    if (req.io) {
      req.io.to(`group_${groupId}`).emit('messageCommentAdded', { groupId, msgId, comment });
      req.io.emit('messageCommentAdded', { groupId, msgId, comment });
    }

    // ─── Notification Logic (same as postRoutes) ───
    try {
      const Notification = require('../models/Notification');
      const msg = await CommunityMessage.findById(msgId);
      if (msg) {
        let recipientId = msg.anonymousId;
        let notifType = 'comment';

        if (parentCommentId) {
          const parentComment = await MessageComment.findById(parentCommentId);
          if (parentComment) {
            recipientId = parentComment.anonymousId;
            notifType = 'reply';
          }
        }

        if (recipientId !== anonymousId) {
          const notification = new Notification({
            recipientId,
            senderNickname: nickname,
            type: notifType,
            groupId,
            postId: msgId,
            commentId: comment._id,
          });
          await notification.save();

          const unreadCount = await Notification.countDocuments({ recipientId, isRead: false });

          const recipient = await User.findOne({ anonymousId: recipientId });
          if (recipient && recipient.pushToken) {
            fetch('https://exp.host/--/api/v2/push/send', {
              method: 'POST',
              headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: recipient.pushToken,
                sound: 'default',
                priority: 'high',
                badge: unreadCount,
                title: 'Aaskitt',
                body: notifType === 'reply'
                  ? `${nickname} replied to your comment: "${text}"`
                  : `${nickname} commented on your message: "${text}"`,
                data: { groupId, msgId },
              }),
            }).catch(err => console.error('Push error:', err));
          }
        }
      }
    } catch (notifErr) {
      console.error('Notification error:', notifErr);
    }

    res.status(201).json(comment);
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST & PUT /api/groups/:groupId/messages/:msgId/view — increment view count
const incrementGroupMessageView = async (req, res) => {
  try {
    const { groupId, msgId } = req.params;
    const msg = await CommunityMessage.findByIdAndUpdate(
      msgId,
      { $inc: { views: 1 } },
      { returnDocument: 'after', new: true }
    );
    if (msg && req.io) {
      req.io.emit('communityMessageViewed', { groupId, msgId, views: msg.views });
    }
    res.json({ views: msg?.views || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
router.post('/:groupId/messages/:msgId/view', incrementGroupMessageView);
router.put('/:groupId/messages/:msgId/view', incrementGroupMessageView);

module.exports = router;
