require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const postRoutes = require('./routes/postRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const configRoutes = require('./routes/configRoutes');
const chatRoutes = require('./routes/chatRoutes');
const communityRoutes = require('./routes/communityRoutes');
const groupRoutes = require('./routes/groupRoutes');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',    // Vite admin panel (local dev)
  'http://localhost:8081',    // Expo dev
  'http://localhost:19006',   // Expo web
  'https://aaskitt-web-pannel.vercel.app', // Vercel production
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/config', configRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/groups', groupRoutes);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler (prevents crashes from unhandled route errors)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// In-memory online users map: anonymousId -> socketId
const onlineUsers = new Map();
app.use((req, res, next) => { req.onlineUsers = onlineUsers; next(); });

// Socket.io
io.on('connection', (socket) => {
  const anonymousId = socket.handshake.auth.anonymousId;
  console.log(`User connected: ${anonymousId} (socket: ${socket.id})`);

  if (anonymousId) {
    // Join personal room
    socket.join(`user_${anonymousId}`);
    // Track online
    onlineUsers.set(anonymousId, socket.id);
    // Broadcast presence to everyone (other users can listen)
    io.emit('user_online', { anonymousId });
  }

  // Join / leave 1-on-1 chat room
  socket.on('join_chat', ({ chatId }) => {
    if (chatId) socket.join(`chat_${chatId}`);
  });

  socket.on('leave_chat', ({ chatId }) => {
    if (chatId) socket.leave(`chat_${chatId}`);
  });

  // Client can ask if a specific user is online
  socket.on('check_online', ({ targetId }, callback) => {
    if (typeof callback === 'function') {
      callback({ online: onlineUsers.has(targetId) });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    if (anonymousId) {
      onlineUsers.delete(anonymousId);
      io.emit('user_offline', { anonymousId });
    }
  });
});

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Prevent process from crashing on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
