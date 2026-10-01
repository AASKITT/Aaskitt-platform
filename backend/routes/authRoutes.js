const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Post = require('../models/Post');
const Comment = require('../models/Comment');
const Group = require('../models/Group');
const CommunityMessage = require('../models/CommunityMessage');
const Notification = require('../models/Notification');
const { generateUniqueNickname, generateRandomAnonymousNickname } = require('../utils/nickname');

// GET /api/auth/google/oauth — Redirects cleanly to Google Standard OAuth 2.0 endpoint (No popups, zero freeze)
router.get('/google/oauth', (req, res) => {
  const { returnUrl, anonId } = req.query;
  const targetReturnUrl = returnUrl || 'aaskittapp://google-auth';
  const clientId = process.env.GOOGLE_CLIENT_ID || '600387765525-tg6rnfkkv19mhu2v7bcrjhegjp9pp6fb.apps.googleusercontent.com';

  // Determine callback URI — Google strictly blocks private LAN IPs (10.x / 192.168.x)
  const host = req.get('host') || '';
  let callbackUrl = 'https://backend.aaskitt.com/api/auth/google/callback';
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    callbackUrl = `http://localhost:${process.env.PORT || 5000}/api/auth/google/callback`;
  }

  const stateObj = {
    returnUrl: targetReturnUrl,
    anonId: anonId || ''
  };
  const stateEncoded = encodeURIComponent(JSON.stringify(stateObj));
  const nonce = Date.now().toString();

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
    `response_type=token%20id_token&` +
    `scope=openid%20email%20profile&` +
    `nonce=${nonce}&` +
    `prompt=select_account&` +
    `state=${stateEncoded}`;

  res.redirect(googleAuthUrl);
});

// GET /api/auth/google/callback — Google redirects here with tokens in URL hash fragment
router.get('/google/callback', (req, res) => {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Aaskitt Auth</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #0f172a;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      text-align: center;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      padding: 32px 24px;
      border-radius: 24px;
      max-width: 360px;
      width: 100%;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top: 3px solid #38bdf8;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .btn {
      display: inline-block;
      margin-top: 18px;
      padding: 12px 24px;
      background: #38bdf8;
      color: #0f172a;
      border-radius: 12px;
      font-weight: 700;
      font-size: 14px;
      text-decoration: none;
    }
    .error-box { color: #f87171; margin-top: 12px; font-size: 13.5px; }
  </style>
</head>
<body>
  <div class="card">
    <div id="loadingBox">
      <div class="spinner"></div>
      <p id="statusMsg" style="color:#94a3b8; font-size:14px; margin:0;">Connecting to Aaskitt...</p>
    </div>
    <div id="btnBox" style="display:none;">
      <a id="returnBtn" class="btn" href="#">Open Aaskitt App</a>
    </div>
  </div>

  <script>
    (async function() {
      try {
        // Extract parameters from hash fragment (#access_token=...&id_token=...&state=...)
        const hash = window.location.hash.substring(1);
        const search = window.location.search.substring(1);
        const params = new URLSearchParams(hash || search);

        const accessToken = params.get('access_token');
        const idToken = params.get('id_token');
        const stateRaw = params.get('state');

        let state = {};
        if (stateRaw) {
          try {
            state = JSON.parse(decodeURIComponent(stateRaw));
          } catch(e) {
            console.warn('Could not parse state:', e);
          }
        }

        const returnUrl = state.returnUrl || 'aaskittapp://google-auth';
        const anonId = state.anonId || '';

        if (!accessToken && !idToken) {
          document.getElementById('statusMsg').innerHTML = '<span class="error-box">Authentication was cancelled or no token returned.</span>';
          document.getElementById('returnBtn').href = returnUrl + (returnUrl.includes('?') ? '&' : '?') + 'error=cancelled';
          document.getElementById('btnBox').style.display = 'block';
          return;
        }

        document.getElementById('statusMsg').textContent = 'Finalizing your profile...';

        // 1. Fetch user info from Google if we have access_token
        let googleUser = null;
        if (accessToken) {
          try {
            const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: 'Bearer ' + accessToken }
            });
            if (userRes.ok) {
              googleUser = await userRes.json();
            }
          } catch (e) {
            console.warn('UserInfo fetch error:', e);
          }
        }

        // 2. Register/login in Aaskitt backend
        const backendRes = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: idToken || undefined,
            googleUser: googleUser ? {
              id: googleUser.sub || googleUser.email,
              email: googleUser.email,
              name: googleUser.name,
              photo: googleUser.picture
            } : undefined,
            currentAnonymousId: anonId
          })
        });

        const authData = await backendRes.json();
        if (!backendRes.ok || !authData.success) {
          throw new Error(authData.error || 'Login registration failed');
        }

        document.getElementById('statusMsg').textContent = 'Success! Returning to app...';

        // 3. Redirect back to mobile app via deep link
        const sep = returnUrl.includes('?') ? '&' : '?';
        const finalUrl = returnUrl + sep + 'auth_data=' + encodeURIComponent(JSON.stringify(authData));

        document.getElementById('returnBtn').href = finalUrl;
        window.location.href = finalUrl;

        setTimeout(() => {
          document.getElementById('btnBox').style.display = 'block';
        }, 1200);

      } catch (err) {
        document.getElementById('statusMsg').innerHTML = '<span class="error-box">Error: ' + (err.message || 'Login failed') + '</span>';
      }
    })();
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
        interests: user.interests || [],
        onboardingComplete: user.onboardingComplete || false,
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
      interests: [],
      onboardingComplete: false,
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
        interests: user.interests || [],
        onboardingComplete: user.onboardingComplete || false,
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
      interests: [],
      onboardingComplete: false,
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
      interests: user.interests || [],
      onboardingComplete: user.onboardingComplete || false,
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

// POST /api/auth/interests — Save user interests during onboarding
router.post('/interests', async (req, res) => {
  try {
    const { anonymousId, interests } = req.body;

    if (!anonymousId) {
      return res.status(400).json({ error: 'anonymousId is required' });
    }
    if (!Array.isArray(interests) || interests.length === 0) {
      return res.status(400).json({ error: 'At least one interest must be selected' });
    }

    const user = await User.findOne({ anonymousId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.interests = interests;
    user.onboardingComplete = true;
    user.lastActive = Date.now();
    await user.save();

    return res.json({
      success: true,
      anonymousId: user.anonymousId,
      interests: user.interests,
      onboardingComplete: user.onboardingComplete,
    });
  } catch (err) {
    console.error('Error in /interests:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
