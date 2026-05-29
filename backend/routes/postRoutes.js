const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const Comment = require('../models/Comment');

// POST /api/posts
router.post('/', async (req, res) => {
  try {
    const { anonymousId, nickname, content, latitude, longitude } = req.body;
    
    if (!content || latitude == null || longitude == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const post = new Post({
      anonymousId,
      nickname,
      content,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON is [lng, lat]
      }
    });

    await post.save();
    
    // Emit socket event (we will attach io to req in server.js)
    req.io.emit('postAdded', post);

    res.status(201).json(post);
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/posts/nearby
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    let posts;

    if (lat && lng) {
      posts = await Post.find({
        status: { $in: ['active', 'reported'] },
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [parseFloat(lng), parseFloat(lat)]
            }
          }
        }
      }).limit(50);
    } else {
      posts = await Post.find({ status: { $in: ['active', 'reported'] } }).sort({ createdAt: -1 }).limit(50);
    }

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
              title: 'Aaskitt Notification',
              body: type === 'reply' ? `${nickname} replied to your comment!` : `${nickname} commented on your post!`,
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

    req.io.emit('postDeleted', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
