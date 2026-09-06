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

// GET /api/posts/nearby (Main Feed)
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, category, subCategory } = req.query;
    
    let query = { status: { $in: ['active', 'reported'] } };

    if (category) {
      if (category === 'rooms') {
        if (subCategory === 'male') {
          // \b ensures it matches "male" but not "female". Negative lookbehind (?<!fe) is not fully supported in all Mongo versions, so \b is safer.
          query.content = { $regex: /\b(male|bachelor|bachelors|boys|gents|men)\b/i };
        } else if (subCategory === 'female') {
          query.content = { $regex: /\b(female|girls|ladies|women)\b/i };
        } else if (subCategory === 'penthouse') {
          query.content = { $regex: /\b(penthouse|pent house|pent-house)\b/i };
        } else if (subCategory === 'family') {
          query.content = { $regex: /\b(family|couple|married)\b/i };
        } else if (subCategory === '1bhk') {
          query.content = { $regex: /\b(1\s?bhk|one bhk)\b/i };
        } else if (subCategory === '2bhk') {
          query.content = { $regex: /\b(2\s?bhk|two bhk)\b/i };
        } else {
          // All rooms
          query.content = { $regex: /\b(room|pg|1bhk|2bhk|rent|roommate|vacancy|male|female|family|penthouse)\b/i };
        }
      } else if (category === 'buy_sell') {
        query.content = { $regex: /buy|sell|sale|price|bechna|kharidna/i };
      } else if (category === 'jobs') {
        query.content = { $regex: /job|hiring|part time|work|home tuition/i };
      }
    }

    // Fetch the 50 latest posts globally, filtered by category, sorted by newest first
    const posts = await Post.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(posts);
  } catch (err) {
    console.error('Error fetching nearby posts:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/user/:anonymousId
router.get('/user/:anonymousId', async (req, res) => {
  try {
    const posts = await Post.find({ anonymousId: req.params.anonymousId }).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) {
    console.error('Error fetching user posts:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/:id
router.get('/:id', async (req, res) => {
  try {
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
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.anonymousId !== anonymousId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    post.content = content.trim();
    post.editedAt = new Date();
    await post.save();
    // Emit real-time update so other clients update instantly
    req.io.emit('postEdited', { postId: post._id, content: post.content, editedAt: post.editedAt });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/posts/:id/view
router.put('/:id/view', async (req, res) => {
  try {
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

    // Notification Logic
    try {
      const Notification = require('../models/Notification');
      const User = require('../models/User');
      
      let recipientId = post.anonymousId;
      let type = 'comment';
      
      if (parentCommentId) {
        const parentComment = await Comment.findById(parentCommentId);
        if (parentComment) {
          recipientId = parentComment.anonymousId;
          type = 'reply';
        }
      }

      // Don't notify if the user is replying to themselves
      if (recipientId !== anonymousId) {
        const notification = new Notification({
          recipientId,
          senderNickname: nickname,
          type,
          postId,
          commentId: comment._id
        });
        await notification.save();

        const unreadCount = await Notification.countDocuments({ recipientId, isRead: false });

        // Send Push Notification
        const recipient = await User.findOne({ anonymousId: recipientId });
        if (recipient && recipient.pushToken) {
          fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: recipient.pushToken,
              sound: 'default',
              priority: 'high',
              channelId: 'default',
              badge: unreadCount,
              title: 'Aaskitt Notification',
              body: type === 'reply' ? `${nickname} replied: "${text}"` : `${nickname} commented: "${text}"`,
              data: { postId: post._id },
            }),
          }).catch(err => console.error('Push notification error:', err));
        }
      }
    } catch (notifErr) {
      console.error('Error sending notification:', notifErr);
    }

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
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
    if (!post) return res.status(404).json({ error: 'Post not found' });
    
    res.json({ message: 'Report submitted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    const post = await Post.findById(req.params.id);
    
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.anonymousId !== anonymousId) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ post: req.params.id });
    const Notification = require('../models/Notification');
    await Notification.deleteMany({ postId: req.params.id });

    req.io.emit('postDeleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
