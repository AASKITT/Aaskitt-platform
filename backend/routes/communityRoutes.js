const express = require('express');
const router = express.Router();
const CommunityMessage = require('../models/CommunityMessage');
const Group = require('../models/Group');
const Notification = require('../models/Notification');

// Helper: send push to many tokens — uses built-in https, no external dep needed
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

// GET /api/community/feed/all — fetch all community messages across all groups for main feed
router.get('/feed/all', async (req, res) => {
  try {
    const messages = await CommunityMessage.find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('groupId', 'name dp rules members tags creatorId')
      .populate('replyTo');

    const formatted = messages.map(msg => {
      const group = msg.groupId;
      return {
        _id: msg._id,
        anonymousId: msg.anonymousId,
        nickname: msg.nickname,
        content: msg.text || (msg.image ? '📷 Shared an image' : ''),
        text: msg.text,
        image: msg.image,
        tag: msg.tag,
        groupId: group?._id ? group._id.toString() : (msg.groupId ? msg.groupId.toString() : ''),
        groupName: group?.name || 'Community',
        groupDp: group?.dp || null,
        groupRules: group?.rules || '',
        groupTags: group?.tags || [],
        groupMembersCount: group?.members?.length || 0,
        isAdminBroadcast: msg.isAdminBroadcast,
        commentsCount: msg.commentsCount || 0,
        views: msg.views || 0,
        createdAt: msg.createdAt,
        edited: msg.edited,
        location: msg.location,
        isCommunityPost: true,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching community feed:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/community/:groupId  — fetch messages for a group
router.get('/:groupId', async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    let messages = await CommunityMessage.find({ groupId: req.params.groupId })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('replyTo');

    // If this is the "Nearby" group, filter messages strictly within 6km of user location
    const isNearbyGroup = group.name && group.name.trim().toLowerCase() === 'nearby';
    if (isNearbyGroup) {
      const userLat = parseFloat(req.query.latitude);
      const userLng = parseFloat(req.query.longitude);
      const viewerId = req.query.anonymousId;

      console.log(`[Nearby GET] userLat: ${userLat}, userLng: ${userLng}, viewerId: ${viewerId}, totalMsgsInGroup: ${messages.length}`);

      if (!isNaN(userLat) && !isNaN(userLng)) {
        const toRad = deg => (deg * Math.PI) / 180;
        const R = 6371; // Earth radius in km

        messages = messages.filter(msg => {
          // User's own posts are always visible to them
          if (viewerId && msg.anonymousId === viewerId) return true;

          const coords = msg.location?.coordinates;
          if (!coords || !Array.isArray(coords) || coords.length < 2) {
            return false;
          }

          const msgLng = coords[0];
          const msgLat = coords[1];
          if (isNaN(msgLat) || isNaN(msgLng)) return false;

          const dLat = toRad(msgLat - userLat);
          const dLng = toRad(msgLng - userLng);
          const lat1 = toRad(userLat);
          const lat2 = toRad(msgLat);

          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const distKm = R * c;

          const isInc = distKm <= 6.0;
          console.log(`[Nearby Msg Filter] "${msg.text?.substring(0, 15)}" by ${msg.nickname} - dist: ${distKm.toFixed(2)} km -> ${isInc ? 'INCLUDED' : 'EXCLUDED'}`);
          return isInc;
        });
        console.log(`[Nearby GET] Result after 6km filter: ${messages.length} messages`);
      }
    }

    res.json(messages.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/community/:groupId  — send a message
router.post('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { anonymousId, nickname, text, image, tag, replyTo, location, latitude, longitude } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if banned
    if (group.bannedUsers.includes(anonymousId)) {
      return res.status(403).json({ error: 'You are banned from this group.' });
    }

    // Must be a member to send (except for the open public "Nearby" community group)
    const isNearby = group.name && group.name.trim().toLowerCase() === 'nearby';
    const isMember = isNearby || group.members.some(m => m.anonymousId === anonymousId);
    if (!isMember) {
      return res.status(403).json({ error: 'Join the group first.' });
    }

    if (!text?.trim() && !image) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    let locationObj = null;
    if (latitude != null && longitude != null) {
      locationObj = { type: 'Point', coordinates: [Number(longitude), Number(latitude)] };
    } else if (location && Array.isArray(location.coordinates) && location.coordinates.length >= 2) {
      locationObj = { type: 'Point', coordinates: [Number(location.coordinates[0]), Number(location.coordinates[1])] };
    } else if (location && location.latitude != null && location.longitude != null) {
      locationObj = { type: 'Point', coordinates: [Number(location.longitude), Number(location.latitude)] };
    } else if (group.location && Array.isArray(group.location.coordinates) && group.location.coordinates.length >= 2) {
      locationObj = { type: 'Point', coordinates: [Number(group.location.coordinates[0]), Number(group.location.coordinates[1])] };
    }

    const newMessage = new CommunityMessage({
      anonymousId,
      nickname,
      text: text?.trim() || '',
      image: image || null,
      tag: tag || null,
      groupId,
      replyTo: replyTo || null,
      location: locationObj,
    });

    await newMessage.save();

    let populatedMessage = newMessage;
    if (replyTo) {
      populatedMessage = await CommunityMessage.findById(newMessage._id).populate('replyTo');
    }

    // Emit socket event to all clients
    req.io.emit('newCommunityMessage', { ...populatedMessage.toObject(), groupId });
    req.io.emit('newPostNotification', { groupId: groupId.toString(), postId: newMessage._id, senderNickname: nickname });

    // Respond immediately to poster
    res.status(201).json(populatedMessage);

    // Fire-and-forget: broadcast in-app + push notifications to all other users
    (async () => {
      try {
        const User = require('../models/User');

        // Target all active users except the sender
        const allUsers = await User.find({ anonymousId: { $ne: anonymousId }, role: 'user' });

        const truncatedText = text?.trim()
          ? (text.trim().length > 70 ? text.trim().substring(0, 70) + '...' : text.trim())
          : '📷 Shared an image';

        const pushTitle = group.name ? `${group.name}` : 'New Community Post';
        const pushBody = `${nickname || 'Someone'}: ${truncatedText}`;

        const messages = [];

        // Save in-app notifications and collect push tokens
        await Promise.all(allUsers.map(async (user) => {
          try {
            const notif = new Notification({
              recipientId: user.anonymousId,
              senderNickname: nickname || 'Anonymous',
              type: 'post_created',
              groupId: groupId.toString(),
              postId: newMessage._id,
              text: text?.trim() || 'sent an image',
            });
            await notif.save();
            req.io.to(`user_${user.anonymousId}`).emit('newNotification', notif);

            // Collect user's push token from User document or group members record
            const token = user.pushToken || group.members?.find(m => m.anonymousId === user.anonymousId)?.expoPushToken;
            if (token) {
              const unreadCount = await Notification.countDocuments({ recipientId: user.anonymousId, isRead: false });
              messages.push({
                to: token,
                sound: 'default',
                priority: 'high',
                channelId: 'default',
                badge: unreadCount,
                title: pushTitle,
                body: pushBody,
                data: {
                  groupId: groupId.toString(),
                  msgId: newMessage._id.toString(),
                  type: 'community_post',
                },
              });
            }
          } catch (e) {
            // skip single failure
          }
        }));

        // Deduplicate messages by push token
        const uniqueMessages = [];
        const seenTokens = new Set();
        for (const m of messages) {
          if (!seenTokens.has(m.to)) {
            seenTokens.add(m.to);
            uniqueMessages.push(m);
          }
        }

        // Send push notifications in batches (Expo allows up to 100 per request)
        const chunks = [];
        for (let i = 0; i < uniqueMessages.length; i += 100) {
          chunks.push(uniqueMessages.slice(i, i + 100));
        }

        for (const chunk of chunks) {
          fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(chunk),
          }).catch(err => console.error('Community push broadcast error:', err));
        }
      } catch (broadcastErr) {
        console.error('Error broadcasting community post notification:', broadcastErr);
      }
    })();
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/community/:groupId/messages/:msgId — author or mod deletes a message
router.delete('/:groupId/messages/:msgId', async (req, res) => {
  try {
    const { groupId, msgId } = req.params;
    const requesterId = req.body.requesterId || req.body.anonymousId;

    const msg = await CommunityMessage.findById(msgId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    let canDelete = false;
    if (msg.anonymousId === requesterId || requesterId === 'team_aaskitt') {
      canDelete = true;
    } else if (groupId && groupId !== 'main') {
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
      req.io.emit('communityMessageDeleted', { groupId: msg.groupId, msgId });
    }
    res.json({ success: true, msgId });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/community/messages/:msgId — direct delete
router.delete('/messages/:msgId', async (req, res) => {
  try {
    const { msgId } = req.params;
    const requesterId = req.body.requesterId || req.body.anonymousId;

    const msg = await CommunityMessage.findById(msgId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    let canDelete = false;
    if (msg.anonymousId === requesterId || requesterId === 'team_aaskitt') {
      canDelete = true;
    } else if (msg.groupId) {
      const group = await Group.findById(msg.groupId);
      if (group && group.creatorId === requesterId) {
        canDelete = true;
      }
    }

    if (!canDelete) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }

    await CommunityMessage.findByIdAndDelete(msgId);
    if (req.io) {
      req.io.emit('communityMessageDeleted', { groupId: msg.groupId, msgId });
    }
    res.json({ success: true, msgId });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/community/messages/:msgId/edit — direct edit
router.put('/messages/:msgId/edit', async (req, res) => {
  try {
    const { msgId } = req.params;
    const { anonymousId, requesterId, content, text } = req.body;
    const authorId = anonymousId || requesterId;

    const msg = await CommunityMessage.findById(msgId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.anonymousId !== authorId) {
      return res.status(403).json({ error: 'Not authorized to edit' });
    }

    const newText = (text || content || '').trim();
    if (!newText && !msg.image) {
      return res.status(400).json({ error: 'Message text required' });
    }

    msg.text = newText;
    msg.edited = true;
    await msg.save();

    if (req.io) {
      req.io.emit('communityMessageUpdated', { groupId: msg.groupId, message: msg });
    }
    res.json(msg);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST & PUT /api/community/:groupId/messages/:msgId/view — increment view count
const incrementCommunityMessageView = async (req, res) => {
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
router.post('/:groupId/messages/:msgId/view', incrementCommunityMessageView);
router.put('/:groupId/messages/:msgId/view', incrementCommunityMessageView);

module.exports = router;
