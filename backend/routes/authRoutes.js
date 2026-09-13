const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Group = require('../models/Group');
const CommunityMessage = require('../models/CommunityMessage');
const Notification = require('../models/Notification');
const { generateUniqueNickname, generateRandomAnonymousNickname } = require('../utils/nickname');

// GET /api/auth/google/oauth — Serves official Google GSI Sign-In page (Zero redirect_uri restrictions)
router.get('/google/oauth', (req, res) => {
  const { returnUrl, anonId } = req.query;
  const targetReturnUrl = returnUrl || 'aaskittapp://google-auth';
  const clientId = process.env.GOOGLE_CLIENT_ID || '600387765525-tg6rnfkkv19mhu2v7bcrjhegjp9pp6fb.apps.googleusercontent.com';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Continue with Google - Aaskitt</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #ffffff;
      text-align: center;
      padding: 24px 16px;
    }
    .card {
      background: #1e293b;
      padding: 36px 24px;
      border-radius: 28px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      max-width: 360px;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .logo-container {
      width: 60px;
      height: 60px;
      background: #ffffff;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    .logo-container svg { width: 32px; height: 32px; }
    h2 { margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #f8fafc; letter-spacing: -0.3px; }
    p { margin: 0 0 24px; font-size: 13.5px; color: #94a3b8; line-height: 1.5; }
    .google-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 14px 20px;
      background: #ffffff;
      color: #0f172a;
      border: none;
      border-radius: 16px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0,0,0,0.15);
      transition: all 0.2s ease;
    }
    .google-btn:active { transform: scale(0.98); opacity: 0.9; }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top: 3px solid #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 20px auto 0;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .status-text { margin-top: 16px; font-size: 13px; color: #38bdf8; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-container">
      <svg viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
    </div>
    <h2 id="title">Aaskitt Sign In</h2>
    <p id="sub">Tap below to choose your Google Account.</p>

    <button id="googleBtn" class="google-btn" onclick="startSignIn()">
      <svg width="18" height="18" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
      </svg>
      <span>Continue with Google</span>
    </button>

    <div id="loadingBox" style="display: none;">
      <div class="spinner"></div>
      <div class="status-text" id="statusMsg">Connecting to Google...</div>
    </div>
  </div>

  <script>
    const CLIENT_ID = '${clientId}';
    const returnUrl = '${targetReturnUrl}';
    const anonId = '${anonId || ''}';
    let tokenClient = null;
    let autoTriggered = false;

    function initGsi() {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        setTimeout(initGsi, 100);
        return;
      }

      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: 'email profile openid',
        prompt: 'select_account',
        callback: async (tokenResponse) => {
          if (tokenResponse.error) {
            document.getElementById('statusMsg').textContent = 'Sign-in cancelled. Tap above to retry.';
            document.getElementById('googleBtn').style.display = 'flex';
            document.getElementById('loadingBox').style.display = 'none';
            return;
          }

          if (tokenResponse.access_token) {
            document.getElementById('googleBtn').style.display = 'none';
            document.getElementById('loadingBox').style.display = 'block';
            document.getElementById('statusMsg').textContent = 'Connecting with Aaskitt...';

            try {
              // 1. Fetch user info from Google
              const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: 'Bearer ' + tokenResponse.access_token }
              });
              const googleUser = await userRes.json();

              if (!googleUser || (!googleUser.sub && !googleUser.email)) {
                throw new Error('Could not retrieve Google profile');
              }

              // 2. Submit to Aaskitt backend
              document.getElementById('statusMsg').textContent = 'Finalizing profile...';
              const backendRes = await fetch('/api/auth/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  googleUser: {
                    id: googleUser.sub || googleUser.email,
                    email: googleUser.email,
                    name: googleUser.name,
                    photo: googleUser.picture
                  },
                  currentAnonymousId: anonId
                })
              });

              const authData = await backendRes.json();
              if (!backendRes.ok || !authData.success) {
                throw new Error(authData.error || 'Server registration failed');
              }

              document.getElementById('statusMsg').textContent = 'Success! Redirecting back to app...';

              // 3. Deep-link back to app
              const sep = returnUrl.includes('?') ? '&' : '?';
              const finalUrl = returnUrl + sep + 'auth_data=' + encodeURIComponent(JSON.stringify(authData));
              window.location.href = finalUrl;

              setTimeout(() => {
                document.getElementById('loadingBox').innerHTML = '<a href="' + finalUrl + '" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#38bdf8;color:#0f172a;border-radius:14px;font-weight:bold;text-decoration:none;">Return to Aaskitt App</a>';
              }, 1200);

            } catch (err) {
              document.getElementById('statusMsg').textContent = err.message || 'Login failed. Please retry.';
              document.getElementById('googleBtn').style.display = 'flex';
              document.getElementById('loadingBox').style.display = 'none';
            }
          }
        }
      });

      // Automatically trigger on page load
      if (!autoTriggered) {
        autoTriggered = true;
        setTimeout(() => {
          try {
            tokenClient.requestAccessToken({ prompt: 'select_account' });
          } catch(e) {
            console.log('Auto trigger notice:', e);
          }
        }, 200);
      }
    }

    function startSignIn() {
      if (tokenClient) {
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } else {
        initGsi();
      }
    }

    window.addEventListener('load', initGsi);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// POST /api/auth/google — Continue with Google (Sign Up & Sign In)
router.post('/google', async (req, res) => {
  try {
    const { idToken, googleUser, currentAnonymousId } = req.body;

    let googleId = null;
    let email = null;
    let photoUrl = null;

    // Verify token if idToken is provided
    if (idToken) {
      try {
        const { OAuth2Client } = require('google-auth-library');
        const clientId = process.env.GOOGLE_CLIENT_ID || '600387765525-tg6rnfkkv19mhu2v7bcrjhegjp9pp6fb.apps.googleusercontent.com';
        const client = new OAuth2Client(clientId);
        const ticket = await client.verifyIdToken({
          idToken,
          audience: clientId,
        });
        const payload = ticket.getPayload();
        googleId = payload['sub'];
        email = payload['email'];
        photoUrl = payload['picture'];
      } catch (verifyErr) {
        console.warn('Google token verify error:', verifyErr.message);
        if (googleUser && (googleUser.id || googleUser.email)) {
          googleId = googleUser.id || googleUser.email;
          email = googleUser.email;
          photoUrl = googleUser.photo;
        } else {
          return res.status(401).json({ error: 'Invalid Google authentication token' });
        }
      }
    } else if (googleUser && (googleUser.id || googleUser.email)) {
      googleId = googleUser.id || googleUser.email;
      email = googleUser.email;
      photoUrl = googleUser.photo;
    } else {
      return res.status(400).json({ error: 'Google authentication data required' });
    }

    // 1. Check if user already exists with matching googleId or email
    let user = await User.findOne({
      $or: [
        ...(googleId ? [{ googleId }] : []),
        ...(email ? [{ email }] : [])
      ]
    });

    if (user) {
      // Existing User: Update lastActive and link info
      user.lastActive = Date.now();
      if (!user.googleId && googleId) user.googleId = googleId;
      if (!user.email && email) user.email = email;
      if (photoUrl && !user.photoUrl) user.photoUrl = photoUrl;
      await user.save();

      // Merge any local temporary posts/comments created with pre-login anonymousId
      if (currentAnonymousId && currentAnonymousId !== user.anonymousId) {
        await Promise.all([
          Post.updateMany({ anonymousId: currentAnonymousId }, { anonymousId: user.anonymousId, ...(user.nickname ? { nickname: user.nickname } : {}) }).catch(() => {}),
          Comment.updateMany({ anonymousId: currentAnonymousId }, { anonymousId: user.anonymousId, ...(user.nickname ? { nickname: user.nickname } : {}) }).catch(() => {}),
          CommunityMessage.updateMany({ anonymousId: currentAnonymousId }, { anonymousId: user.anonymousId, ...(user.nickname ? { nickname: user.nickname } : {}) }).catch(() => {}),
          Notification.updateMany({ recipientId: currentAnonymousId }, { recipientId: user.anonymousId }).catch(() => {}),
          Group.updateMany({ creatorId: currentAnonymousId }, { creatorId: user.anonymousId, ...(user.nickname ? { creatorNickname: user.nickname } : {}) }).catch(() => {}),
          Group.updateMany({ 'members.anonymousId': currentAnonymousId }, { $set: { 'members.$.anonymousId': user.anonymousId, ...(user.nickname ? { 'members.$.nickname': user.nickname } : {}) } }).catch(() => {}),
        ]);
      }

      return res.json({
        success: true,
        isNewUser: false,
        anonymousId: user.anonymousId,
        nickname: user.nickname || null,
        isGoogleLinked: true,
        email: user.email,
        photoUrl: user.photoUrl,
        createdAt: user.createdAt,
      });
    }

    // 2. New User: Create record without fixed nickname (user sets nickname on first activity)
    const targetAnonId = currentAnonymousId || ('anon_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36));

    // Ensure anonymousId is not taken by another user
    const existingAnon = await User.findOne({ anonymousId: targetAnonId });
    const finalAnonymousId = existingAnon 
      ? ('anon_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36))
      : targetAnonId;

    user = new User({
      anonymousId: finalAnonymousId,
      nickname: null,
      googleId: googleId,
      email: email,
      photoUrl: photoUrl,
      lastActive: Date.now(),
      createdAt: Date.now(),
    });

    await user.save();

    return res.status(201).json({
      success: true,
      isNewUser: true,
      anonymousId: user.anonymousId,
      nickname: null,
      isGoogleLinked: true,
      email: user.email,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('Error in /api/auth/google:', err);
    res.status(500).json({ error: 'Google login failed on server' });
  }
});

// POST /api/auth/anonymous — Set / Choose Nickname (with unique suffix _1, _2, _3 if taken)
router.post('/anonymous', async (req, res) => {
  try {
    const { anonymousId, requestedNickname } = req.body;
    
    if (!anonymousId || !requestedNickname || !requestedNickname.trim()) {
      return res.status(400).json({ error: 'anonymousId and requestedNickname are required' });
    }

    const uniqueNickname = await generateUniqueNickname(requestedNickname.trim());

    let user = await User.findOne({ anonymousId });
    if (user) {
      user.nickname = uniqueNickname;
      user.lastActive = Date.now();
      await user.save();

      // Update nickname in existing posts, comments, community messages, and groups
      await Promise.all([
        Post.updateMany({ anonymousId: user.anonymousId }, { nickname: uniqueNickname }).catch(() => {}),
        Comment.updateMany({ anonymousId: user.anonymousId }, { nickname: uniqueNickname }).catch(() => {}),
        CommunityMessage.updateMany({ anonymousId: user.anonymousId }, { nickname: uniqueNickname }).catch(() => {}),
        Group.updateMany({ creatorId: user.anonymousId }, { creatorNickname: uniqueNickname }).catch(() => {}),
        Group.updateMany({ 'members.anonymousId': user.anonymousId }, { $set: { 'members.$.nickname': uniqueNickname } }).catch(() => {}),
      ]);

      return res.status(200).json({
        success: true,
        nickname: user.nickname,
        anonymousId: user.anonymousId,
        isGoogleLinked: !!user.googleId,
        createdAt: user.createdAt,
      });
    }

    user = new User({
      anonymousId,
      nickname: uniqueNickname,
      lastActive: Date.now(),
      createdAt: Date.now(),
    });
    
    await user.save();
    return res.status(201).json({
      success: true,
      nickname: user.nickname,
      anonymousId: user.anonymousId,
      isGoogleLinked: false,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('Error in /anonymous:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me/:anonymousId
router.get('/me/:anonymousId', async (req, res) => {
  try {
    const { anonymousId } = req.params;
    if (!anonymousId) {
      return res.status(400).json({ error: 'anonymousId is required' });
    }

    const user = await User.findOne({ anonymousId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      success: true,
      anonymousId: user.anonymousId,
      nickname: user.nickname,
      isGoogleLinked: !!user.googleId,
      email: user.email,
      photoUrl: user.photoUrl,
      createdAt: user.createdAt,
    });
  } catch (err) {
    console.error('Error in /me:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/ping
router.post('/ping', async (req, res) => {
  try {
    const { anonymousId } = req.body;
    if (!anonymousId) {
      return res.status(400).json({ error: 'anonymousId is required' });
    }

    await User.updateOne({ anonymousId }, { lastActive: Date.now() });
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /ping:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
