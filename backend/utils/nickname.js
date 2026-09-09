const User = require('../models/User');

const ADJECTIVES = [
  'Swift', 'Cosmic', 'Shadow', 'Neon', 'Brave', 'Mystic', 'Echo', 'Alpha',
  'Nova', 'Cyber', 'Urban', 'Silver', 'Apex', 'Hyper', 'Velvet', 'Frost',
  'Solar', 'Lunar', 'Zenith', 'Phantom', 'Aero', 'Volt', 'Storm', 'Pulse'
];

const NOUNS = [
  'Falcon', 'Wolf', 'Tiger', 'Panda', 'Hawk', 'Fox', 'Eagle', 'Knight',
  'Nomad', 'Viper', 'Otter', 'Lynx', 'Raven', 'Ghost', 'Ranger', 'Pioneer',
  'Spark', 'Drifter', 'Voyager', 'Cobra', 'Phoenix', 'Striker', 'Titan', 'Sage'
];

const generateRandomNickname = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj}${noun}${num}`;
};

const generateUniqueNickname = async (baseNickname) => {
  let nickname = baseNickname ? baseNickname.replace(/[^a-zA-Z0-9_]/g, '').trim() : '';
  if (!nickname || nickname.length < 2) {
    nickname = generateRandomNickname();
  }

  let testName = nickname;
  let counter = 1;
  while (true) {
    const existingUser = await User.findOne({ nickname: testName });
    if (!existingUser) {
      return testName;
    }
    testName = `${nickname}_${counter}`;
    counter++;
  }
};

module.exports = { generateUniqueNickname, generateRandomNickname };
