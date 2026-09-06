const express = require('express');
const router = express.Router();
const ChatRequest = require('../models/ChatRequest');
const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');

// ── GET /api/chats/unread/:anonymousId ──────────────────────────────────────
// Returns total unread count (pending requests + unread messages)
router.get('/unread/:anonymousId', async (req, res) => {
  try {
    const id = req.params.anonymousId;
    // Count pending requests
    const requestCount = await ChatRequest.countDocuments({ toAnonymousId: id, status: 'pending' });
    // Count unread messages across all accepted chats
    const acceptedChats = await ChatRequest.find({
      status: 'accepted',
      $or: [{ fromAnonymousId: id }, { toAnonymousId: id }],
    }).select('_id');
    const chatIds = acceptedChats.map(c => c._id);
    const unreadMessages = chatIds.length > 0
      ? await Message.countDocuments({ chatRequestId: { $in: chatIds }, fromAnonymousId: { $ne: id }, read: false })
      : 0;
    res.json({ total: requestCount + unreadMessages, requestCount, unreadMessages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/chats/request ─────────────────────────────────────────────────
// Send a chat request with a first message
router.post('/request', async (req, res) => {
  try {
    const { fromAnonymousId, fromNickname, toAnonymousId, toNickname, postId, firstMessage } = req.body;

    if (!firstMessage?.trim()) return res.status(400).json({ error: 'First message is required.' });
    if (fromAnonymousId === toAnonymousId) return res.status(400).json({ error: 'Cannot message yourself.' });

    // Check if a pending/accepted request already exists
    const existing = await ChatRequest.findOne({
      fromAnonymousId,
      toAnonymousId,
      postId,
      status: { $in: ['pending', 'accepted'] }
    });
    if (existing) {
      return res.status(409).json({ error: 'Request already sent.', chatRequestId: existing._id, status: existing.status });
    }

    const request = await ChatRequest.create({
      fromAnonymousId, fromNickname,
      toAnonymousId, toNickname,
      postId, firstMessage: firstMessage.trim(),
    });

    // Also save the first message in Messages collection so it shows in chat history
    await Message.create({
      chatRequestId: request._id,
      fromAnonymousId,
      text: firstMessage.trim(),
    });

    // Create in-app notification
    await Notification.create({
      recipientId: toAnonymousId,
      senderNickname: fromNickname,
      type: 'chat_request',
      chatId: request._id,
    });

    // Real-time: notify receiver via socket
    if (req.io) {
      req.io.to(`user_${toAnonymousId}`).emit('new_chat_request', {
        requestId: request._id,
        fromNickname,
        firstMessage: firstMessage.trim(),
      });
    }

    // Send Push Notification
    try {
      const User = require('../models/User');
      const recipient = await User.findOne({ anonymousId: toAnonymousId });
      if (recipient && recipient.pushToken) {
        const unreadCount = await Notification.countDocuments({ recipientId: toAnonymousId, isRead: false });
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipient.pushToken,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            badge: unreadCount,
            title: 'New Chat Request',
            body: `${fromNickname} wants to chat: "${firstMessage.substring(0, 40)}${firstMessage.length > 40 ? '...' : ''}"`,
            data: { type: 'chat_request', chatId: request._id },
          }),
        }).catch(err => console.error('Push error:', err));
      }
    } catch (e) {
      console.error('Push send error:', e);
    }

    res.status(201).json({ success: true, chatRequestId: request._id });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Request already sent.' });
    }
    console.error('Send chat request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/chats/requests/:anonymousId ────────────────────────────────────
// Get all incoming PENDING chat requests for a user
router.get('/requests/:anonymousId', async (req, res) => {
  try {
    const requests = await ChatRequest.find({
      toAnonymousId: req.params.anonymousId,
      status: 'pending',
    }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/chats/request/:id/accept ───────────────────────────────────────
router.put('/request/:id/accept', async (req, res) => {
  try {
    const request = await ChatRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    request.status = 'accepted';
    await request.save();

    // Notify sender that request was accepted
    if (req.io) {
      req.io.to(`user_${request.fromAnonymousId}`).emit('chat_request_accepted', {
        chatRequestId: request._id,
        fromNickname: request.toNickname,
      });
    }

    // Create in-app notification
    await Notification.create({
      recipientId: request.fromAnonymousId,
      senderNickname: request.toNickname,
      type: 'chat_accepted',
      chatId: request._id,
    });

    // Send Push Notification
    try {
      const User = require('../models/User');
      const recipient = await User.findOne({ anonymousId: request.fromAnonymousId });
      if (recipient && recipient.pushToken) {
        const unreadCount = await Notification.countDocuments({ recipientId: request.fromAnonymousId, isRead: false });
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: recipient.pushToken,
            sound: 'default',
            priority: 'high',
            channelId: 'default',
            badge: unreadCount,
            title: 'Request Accepted',
            body: `${request.toNickname} accepted your chat request! You can now chat.`,
            data: { type: 'chat_accepted', chatId: request._id },
          }),
        }).catch(err => console.error('Push error:', err));
      }
    } catch (e) {
      console.error('Push send error:', e);
    }

    res.json({ success: true, chatRequest: request });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/chats/request/:id/decline ──────────────────────────────────────
router.put('/request/:id/decline', async (req, res) => {
  try {
    const request = await ChatRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    request.status = 'declined';
    await request.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/chats/:anonymousId ─────────────────────────────────────────────
// Get all ACCEPTED chats for a user (both sides)
router.get('/:anonymousId', async (req, res) => {
  try {
    const id = req.params.anonymousId;
    const chats = await ChatRequest.find({
      status: 'accepted',
      $or: [{ fromAnonymousId: id }, { toAnonymousId: id }],
    }).sort({ updatedAt: -1 });

    // Attach last message for each chat
    const chatsWithLastMsg = await Promise.all(chats.map(async (chat) => {
      const lastMsg = await Message.findOne({ chatRequestId: chat._id }).sort({ createdAt: -1 });
      const unreadCount = await Message.countDocuments({
        chatRequestId: chat._id,
        fromAnonymousId: { $ne: id },
        read: false,
      });
      return { ...chat.toObject(), lastMessage: lastMsg, unreadCount };
    }));

    res.json(chatsWithLastMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/chats/:chatId/messages ─────────────────────────────────────────
router.get('/:chatId/messages', async (req, res) => {
  try {
    const { anonymousId } = req.query;
    const messages = await Message.find({ chatRequestId: req.params.chatId }).sort({ createdAt: 1 });

    // Mark all messages from the other person as read
    if (anonymousId) {
      await Message.updateMany(
        { chatRequestId: req.params.chatId, fromAnonymousId: { $ne: anonymousId }, read: false },
        { $set: { read: true } }
      );
    }

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ── POST /api/chats/:chatId/messages ────────────────────────────────────────
router.post('/:chatId/messages', async (req, res) => {
  try {
    const { fromAnonymousId, text, images } = req.body;
    if (!text?.trim() && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Message cannot be empty.' });
    }

    const chatRequest = await ChatRequest.findById(req.params.chatId);
    if (!chatRequest || chatRequest.status !== 'accepted') {
      return res.status(403).json({ error: 'Chat not active.' });
    }

    // Handle image uploads
    let uploadedImages = [];
    if (images && images.length > 0) {
      for (const base64Img of images) {
        try {
          const result = await cloudinary.uploader.upload(base64Img, {
            folder: 'aaskitt_chats',
          });
          uploadedImages.push(result.secure_url);
        } catch (err) {
          console.error("Cloudinary upload error:", err);
        }
      }
    }

    const message = await Message.create({
      chatRequestId: req.params.chatId,
      fromAnonymousId,
      text: text?.trim() || '',
      images: uploadedImages,
    });

    // Update chat's updatedAt so it appears at top of list
    await ChatRequest.findByIdAndUpdate(req.params.chatId, { updatedAt: new Date() });

    // Emit to the other user in real-time
    const toId = chatRequest.fromAnonymousId === fromAnonymousId
      ? chatRequest.toAnonymousId
      : chatRequest.fromAnonymousId;

    if (req.io) {
      const payload = {
        chatRequestId: req.params.chatId,
        chatId: req.params.chatId,
        message,
      };
      req.io.to(`user_${toId}`).emit('new_message', payload);
      req.io.to(`user_${fromAnonymousId}`).emit('new_message', payload);
      req.io.to(`chat_${req.params.chatId}`).emit('new_message', payload);
    }

    // Create in-app notification
    const sender = await User.findOne({ anonymousId: fromAnonymousId });
    if (sender) {
      await Notification.create({
        recipientId: toId,
        senderNickname: sender.nickname,
        type: 'new_message',
        chatId: req.params.chatId,
        text: text?.trim() || (uploadedImages.length > 0 ? '📷 Image' : ''),
      });
    }

    // Send Push Notification
    try {
      const recipient = await User.findOne({ anonymousId: toId });
      const sender = await User.findOne({ anonymousId: fromAnonymousId });
      
      if (recipient && recipient.pushToken && sender) {
        let notificationBody = text?.trim() || '';
        if (!notificationBody && uploadedImages.length > 0) {
          notificationBody = '📷 Sent an image';
        }

        const unreadCount = await Notification.countDocuments({ recipientId: toId, isRead: false });

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
            title: `New message from ${sender.nickname || 'Someone'}`,
            body: notificationBody,
            data: { chatId: req.params.chatId, type: 'chat' },
          }),
        }).catch(err => console.error('Push notification error:', err));
      }
    } catch (pushErr) {
      console.error('Failed to send push notification:', pushErr);
    }

    res.status(201).json(message);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/chats/:chatId/messages/:messageId ──────────────────────────
// Delete a specific message from a chat
router.delete('/:chatId/messages/:messageId', async (req, res) => {
  try {
    const { anonymousId, imageUrl } = req.body;
    const { chatId, messageId } = req.params;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: 'Message not found' });
    if (message.chatRequestId.toString() !== chatId) return res.status(400).json({ error: 'Message does not belong to this chat' });
    if (message.fromAnonymousId !== anonymousId) return res.status(403).json({ error: 'You can only delete your own messages' });

    let isEntireMessageDeleted = false;

    if (imageUrl && message.images?.includes(imageUrl)) {
      message.images = message.images.filter(img => img !== imageUrl);
      
      // If no text and no images left, delete the entire message
      if (message.images.length === 0 && !message.text) {
        await Message.findByIdAndDelete(messageId);
        isEntireMessageDeleted = true;
      } else {
        await message.save();
      }
    } else {
      // No imageUrl provided, delete entire message
      await Message.findByIdAndDelete(messageId);
      isEntireMessageDeleted = true;
    }

    const chatRequest = await ChatRequest.findById(chatId);
    if (chatRequest) {
      const toId = chatRequest.fromAnonymousId === anonymousId ? chatRequest.toAnonymousId : chatRequest.fromAnonymousId;
      if (req.io) {
        if (isEntireMessageDeleted) {
          req.io.to(`user_${toId}`).emit('message_deleted', { chatId, messageId });
        } else {
          // Emit updated message
          req.io.to(`user_${toId}`).emit('message_updated', { chatId, message });
        }
      }
    }

    res.json({ success: true, isEntireMessageDeleted, message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/chats/:chatId ───────────────────────────────────────────────
// Delete chat from both sides
router.delete('/:chatId', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    const chat = await ChatRequest.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    // Ensure the requester is part of this chat
    if (chat.fromAnonymousId !== anonymousId && chat.toAnonymousId !== anonymousId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const otherId = chat.fromAnonymousId === anonymousId ? chat.toAnonymousId : chat.fromAnonymousId;

    // Delete all messages
    await Message.deleteMany({ chatRequestId: chat._id });
    
    // Delete the chat request
    await ChatRequest.findByIdAndDelete(chat._id);

    // Notify other user
    if (req.io) {
      req.io.to(`user_${otherId}`).emit('chat_deleted', { chatId: chat._id });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
