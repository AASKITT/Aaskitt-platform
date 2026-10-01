const Group = require('../models/Group');
const Post = require('../models/Post');
const CommunityMessage = require('../models/CommunityMessage');
const Comment = require('../models/Comment');
const MessageComment = require('../models/MessageComment');

async function migratePostsToNearbyGroup() {
  try {
    // 1. Find or create "Nearby" community group
    let nearbyGroup = await Group.findOne({ name: { $regex: /^nearby$/i } });
    if (!nearbyGroup) {
      nearbyGroup = new Group({
        name: 'Nearby',
        rules: 'Local updates, questions, and discussions with everyone nearby in your area.',
        creatorId: 'team_aaskitt',
        creatorNickname: 'Team Aaskitt',
        inviteCode: 'NEARBY',
        tags: ['Nearby', 'Local', 'General', 'AskLocal'],
        location: { type: 'Point', coordinates: [78.4867, 17.3850] },
        locationName: 'Nearby',
        members: [{ anonymousId: 'team_aaskitt', nickname: 'Team Aaskitt', joinedAt: new Date() }],
      });
      await nearbyGroup.save();
      console.log('✅ Created official "Nearby" community group.');
    }

    // 2. Fetch all public posts
    const posts = await Post.find({ status: { $ne: 'deleted' } });
    if (!posts || posts.length === 0) {
      return nearbyGroup;
    }

    let migratedCount = 0;
    for (const post of posts) {
      // Check if message already exists in Nearby group
      const existing = await CommunityMessage.findOne({
        groupId: nearbyGroup._id,
        anonymousId: post.anonymousId,
        text: post.content,
      });

      if (!existing) {
        const msg = new CommunityMessage({
          anonymousId: post.anonymousId || 'Anonymous',
          nickname: post.nickname || 'Anonymous',
          text: post.content || '',
          groupId: nearbyGroup._id,
          location: post.location || { type: 'Point', coordinates: [78.4867, 17.3850] },
          views: post.views || 0,
          commentsCount: post.commentsCount || 0,
          createdAt: post.createdAt || new Date(),
        });
        await msg.save();
        migratedCount++;

        // Migrate comments for this post if any
        const comments = await Comment.find({ post: post._id });
        for (const c of comments) {
          const existingComment = await MessageComment.findOne({
            messageId: msg._id,
            anonymousId: c.anonymousId,
            text: c.text,
          });
          if (!existingComment) {
            await MessageComment.create({
              messageId: msg._id,
              anonymousId: c.anonymousId || 'Anonymous',
              nickname: c.nickname || 'Anonymous',
              text: c.text,
              createdAt: c.createdAt || new Date(),
            });
          }
        }
      }
    }

    if (migratedCount > 0) {
      console.log(`✅ [Migration] Migrated ${migratedCount} public posts into "Nearby" community group.`);
    }

    return nearbyGroup;
  } catch (err) {
    console.error('Error migrating posts to Nearby group:', err);
  }
}

module.exports = migratePostsToNearbyGroup;
