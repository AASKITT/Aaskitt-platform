const User = require('../models/User');

const ADJECTIVES = [
  'Swift', 'Brave', 'Silent', 'Mystic', 'Cosmic', 'Clever', 'Shadow',
  'Radiant', 'Lunar', 'Solar', 'Curious', 'Golden', 'Velvet', 'Wild',
  'Happy', 'Cool', 'Neon', 'Amber', 'Frost', 'Spark', 'Noble', 'Chill',
  'Vibrant', 'Zen', 'Astral', 'Hyper', 'Mighty', 'Breezy', 'Echo', 'Phoenix'
];

const NOUNS = [
  'Fox', 'Owl', 'Tiger', 'Eagle', 'Panda', 'Wolf', 'Hawk', 'Falcon',
  'Otter', 'Bear', 'Dolphin', 'Pioneer', 'Voyager', 'Star', 'Lynx',
  'Badger', 'Raven', 'Cheetah', 'Leopard', 'Panther', 'Lion', 'Falcon',
  'Ranger', 'Knight', 'Orbit', 'Comet', 'Nomad', 'Seeker', 'Spark', 'Nova'
];

const generateRandomAnonymousNickname = async () => {
  let attempts = 0;
  while (attempts < 50) {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(10 + Math.random() * 90);
    const candidate = `${adj}${noun}_${num}`;
    
    const existing = await User.findOne({ nickname: candidate });
    if (!existing) {
      return candidate;
    }
    attempts++;
  }
  return `User_${Math.floor(1000 + Math.random() * 9000)}`;
};

const generateUniqueNickname = async (baseNickname) => {
  let cleanBase = (baseNickname || 'User').trim().replace(/[\s\t\n]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleanBase) cleanBase = 'User';
  let nickname = cleanBase;
  let counter = 1;
  while (true) {
    const existingUser = await User.findOne({
      nickname: { $regex: new RegExp(`^${nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (!existingUser) {
      return nickname;
    }
    nickname = `${cleanBase}_${counter}`;
    counter++;
  }
};

module.exports = { generateUniqueNickname, generateRandomAnonymousNickname };

