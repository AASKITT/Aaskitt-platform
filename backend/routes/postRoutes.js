const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Comment = require('../models/Comment');

// POST /api/posts
router.post('/', async (req, res) => {
  try {
    const { anonymousId, nickname, content, latitude, longitude, locationName } = req.body;
    
    if (!content || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const post = new Post({
      anonymousId,
      nickname,
      content,
      locationName: locationName || '',
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON is [lng, lat]
      }
    });

    await post.save();
    
    // Emit socket event to all clients
    req.io.emit('postAdded', post);
    // Emit dedicated event so clients can update notification badge in real-time
    req.io.emit('newPostNotification', { postId: post._id, senderNickname: nickname });

    res.status(201).json(post);

    // Fire-and-forget: save in-app notifications + send push to all other users
    // Run asynchronously to not block the request
    (async () => {
      try {
        const Notification = require('../models/Notification');
        const User = require('../models/User');

        // Get all users except the poster
        const allUsers = await User.find({ anonymousId: { $ne: anonymousId }, role: 'user' });

        const truncatedContent = content.length > 60 ? content.substring(0, 60) + '...' : content;
        const pushTitle = `${nickname || 'Someone'} created a new post`;
        const pushBody = truncatedContent;

        const messages = [];

        // Save notifications and prepare push messages concurrently
        await Promise.all(allUsers.map(async (user) => {
          try {
            const notif = new Notification({
              recipientId: user.anonymousId,
              senderNickname: nickname || 'Anonymous',
              type: 'post_created',
              postId: post._id,
            });
            await notif.save();
            
            if (user.pushToken) {
              const unreadCount = await Notification.countDocuments({ recipientId: user.anonymousId, isRead: false });
              messages.push({
                to: user.pushToken,
                sound: 'default',
                priority: 'high',
                channelId: 'default',
                badge: unreadCount,
                title: pushTitle,
                body: pushBody,
                data: { postId: post._id.toString(), type: 'post_created' },
              });
            }
          } catch (e) {
            // skip individual failures silently
          }
        }));

        // Send push notifications in batches (Expo allows up to 100 per request)
        const chunks = [];
        for (let i = 0; i < messages.length; i += 100) {
          chunks.push(messages.slice(i, i + 100));
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
          }).catch(err => console.error('Push error:', err));
        }
      } catch (notifErr) {
        console.error('Error sending new post notifications:', notifErr);
      }
    })();

  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/nearby (Main Feed — returns community posts)
router.get('/nearby', async (req, res) => {
  try {
    const CommunityMessage = require('../models/CommunityMessage');
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
    console.error('Error fetching nearby posts:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/user/:anonymousId
router.get('/user/:anonymousId', async (req, res) => {
  try {
    const CommunityMessage = require('../models/CommunityMessage');
    const messages = await CommunityMessage.find({ anonymousId: req.params.anonymousId })
      .sort({ createdAt: -1 })
      .populate('groupId', 'name dp rules members tags creatorId');

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
        commentsCount: msg.commentsCount || 0,
        views: msg.views || 0,
        createdAt: msg.createdAt,
        edited: msg.edited,
        isCommunityPost: true,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Error fetching user posts:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/:id
router.get('/:id', async (req, res) => {
  try {
    const CommunityMessage = require('../models/CommunityMessage');
    const msg = await CommunityMessage.findById(req.params.id)
      .populate('groupId', 'name dp rules members tags creatorId');
    if (msg) {
      const group = msg.groupId;
      return res.json({
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
        commentsCount: msg.commentsCount || 0,
        views: msg.views || 0,
        createdAt: msg.createdAt,
        edited: msg.edited,
        isCommunityPost: true,
      });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/posts/:id/edit
router.put('/:id/edit', async (req, res) => {
  try {
    const { anonymousId, content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Content cannot be empty.' });
    }

    const CommunityMessage = require('../models/CommunityMessage');
    const msg = await CommunityMessage.findById(req.params.id);
    if (msg) {
      if (msg.anonymousId !== anonymousId) {
        return res.status(403).json({ error: 'Not authorized' });
      }
      msg.text = content.trim();
      msg.edited = true;
      await msg.save();
      req.io.emit('postEdited', { postId: msg._id, content: msg.text, editedAt: new Date() });
      return res.json({ ...msg.toObject(), content: msg.text });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.anonymousId !== anonymousId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    post.content = content.trim();
    post.editedAt = new Date();
    await post.save();
    req.io.emit('postEdited', { postId: post._id, content: post.content, editedAt: post.editedAt });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/posts/:id/view
router.put('/:id/view', async (req, res) => {
  try {
    const CommunityMessage = require('../models/CommunityMessage');
    const msg = await CommunityMessage.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
    if (msg) {
      return res.json({ success: true, views: msg.views });
    }

    const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }, { new: true });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    
    res.json({ success: true, views: post.views });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/posts/:id/comments
router.post('/:id/comments', async (req, res) => {
  try {
    const { anonymousId, nickname, text, parentCommentId } = req.body;
    const postId = req.params.id;

    const CommunityMessage = require('../models/CommunityMessage');
    const MessageComment = require('../models/MessageComment');
    const msg = await CommunityMessage.findById(postId);
    if (msg) {
      const comment = new MessageComment({
        messageId: postId,
        anonymousId,
        nickname,
        text,
        parentComment: parentCommentId || null
      });
      await comment.save();
      msg.commentsCount = (msg.commentsCount || 0) + 1;
      await msg.save();
      req.io.emit('commentAdded', { postId, comment });
      return res.status(201).json(comment);
    }

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const comment = new Comment({
      post: postId,
      anonymousId,
      nickname,
      text,
      parentComment: parentCommentId || null
    });
    await comment.save();

    post.commentsCount += 1;
    await post.save();

    req.io.emit('commentAdded', { postId, comment });
    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const MessageComment = require('../models/MessageComment');
    const commComments = await MessageComment.find({ messageId: req.params.id }).sort({ createdAt: 1 });
    if (commComments && commComments.length > 0) {
      return res.json(commComments);
    }

    const comments = await Comment.find({ post: req.params.id }).sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/posts/:id/report
router.post('/:id/report', async (req, res) => {
  try {
    const post = await Post.findByIdAndUpdate(req.params.id, { status: 'reported' });
    res.json({ message: 'Report submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { anonymousId } = req.body;

    const CommunityMessage = require('../models/CommunityMessage');
    const MessageComment = require('../models/MessageComment');
    const msg = await CommunityMessage.findById(req.params.id);
    if (msg) {
      if (msg.anonymousId !== anonymousId) {
        return res.status(403).json({ error: 'Not authorized to delete this post' });
      }
      await CommunityMessage.findByIdAndDelete(req.params.id);
      await MessageComment.deleteMany({ messageId: req.params.id });
      req.io.emit('postDeleted', req.params.id);
      return res.json({ success: true });
    }

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.anonymousId !== anonymousId) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ post: req.params.id });
    req.io.emit('postDeleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
