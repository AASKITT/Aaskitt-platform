const User = require('../models/User');

const generateUniqueNickname = async (baseNickname) => {
  let nickname = baseNickname;
  let counter = 1;
  while (true) {
    const existingUser = await User.findOne({ nickname });
    if (!existingUser) {
      return nickname;
    }
    nickname = `${baseNickname}_${counter}`;
    counter++;
  }
};

module.exports = { generateUniqueNickname };
