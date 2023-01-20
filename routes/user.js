const express = require("express");
const router = express.Router();

const SHA256 = require("crypto-js/sha256");
const encBase64 = require("crypto-js/enc-base64");
const uid2 = require("uid2");

const User = require("../models/User");
const fileUpload = require("express-fileupload");

const cloudinary = require("cloudinary").v2;

const convertToBase64 = require("../utils/convertToBase64");

router.post("/user/signup", fileUpload(), async (req, res) => {
  const { username, email, password, newsletter } = req.body;
  // Manage Password
  const salt = uid2(16);
  const hash = SHA256(password + salt).toString(encBase64);
  const token = uid2(16);
  try {
    if (!username) {
      return res
        .status(400)
        .json({ error: { message: "Please send Username" } });
    } else if (!email || !password) {
      return res
        .status(400)
        .json({ error: { message: "Please send all informations" } });
    }
    const EmailAlreadyExist = await User.find({ email: email }, "email");
    // email not in DB
    if (EmailAlreadyExist.length > 0) {
      return res.status(409).json({ error: { message: "Email already Use" } });
    }

    // Create User
    const newUser = new User({
      email,
      account: {
        username,
        avatar: null, // TODO: Implement IMG for avatar
      },
      newsletter,
      token,
      hash,
      salt,
    });
    await newUser.save();

    // Process image
    if (req.files) {
      const img = req.files.picture;
      const imgBase64 = convertToBase64(img);
      const resultUploadImage = await cloudinary.uploader.upload(imgBase64, {
        folder: "/vinted/profile_picture",
        public_id: newUser._id,
      });
      newUser.account.avatar = resultUploadImage;
      await newUser.save();
    }

    res.json({
      _id: newUser._id,
      token: newUser.token,
      account: { username: newUser.account.username },
    });
  } catch (error) {
    return res.json(error.message);
  }
});

router.post("/user/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const UserTryToConnect = await User.findOne({ email: email });

    if (!UserTryToConnect) {
      return res.status(401).json({
        error: { message: `Connection Failed : Wrong email or password` },
      });
    }
    const hash = SHA256(password + UserTryToConnect.salt).toString(encBase64);
    if (hash === UserTryToConnect.hash) {
      return res.json({
        _id: UserTryToConnect._id,
        token: UserTryToConnect.token,
        account: { username: UserTryToConnect.account.username },
      });
    } else {
      return res.json({
        error: { message: "Connection Failed : Wrong email or password" },
      });
    }
  } catch (error) {
    return res.status(401).json({ error: { message: error.message } });
  }
});

module.exports = router;
