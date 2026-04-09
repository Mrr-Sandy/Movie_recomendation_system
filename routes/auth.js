const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { getRequiredEnv } = require("../lib/env");

const router = express.Router();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeText = (value) => String(value || "").trim().replace(/[<>$]/g, "");
const sanitizeEmail = (value) => sanitizeText(value).toLowerCase();

const createToken = (userId) =>
  jwt.sign({ userId }, getRequiredEnv("JWT_SECRET"), { expiresIn: "7d" });

router.post("/register", async (req, res) => {
  try {
    const username = sanitizeText(req.body.username);
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (username.length < 3) {
      return res.status(400).json({ message: "Username must be at least 3 characters" });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ message: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      preferences: { genres: [], mood: "", favoriteMovies: [] },
    });

    const token = createToken(user._id.toString());

    return res.status(201).json({ token, user: user.toJSON() });
  } catch (error) {
    if (error.code === "CONFIG_ERROR") {
      return res.status(error.statusCode || 500).json({ message: error.message });
    }

    if (process.env.NODE_ENV !== "production") {
      console.error("Register error:", error);
    }
    return res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email" });
    }

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Wrong password" });
    }

    const token = createToken(user._id.toString());

    return res.json({ token, user: user.toJSON() });
  } catch (error) {
    if (error.code === "CONFIG_ERROR") {
      return res.status(error.statusCode || 500).json({ message: error.message });
    }

    if (process.env.NODE_ENV !== "production") {
      console.error("Login error:", error);
    }
    return res.status(500).json({ message: "Login failed" });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Get me error:", error);
    }
    return res.status(500).json({ message: "Failed to load user data" });
  }
});

module.exports = router;
