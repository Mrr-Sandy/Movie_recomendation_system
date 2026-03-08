const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const User = require("../models/User");
const WatchHistory = require("../models/WatchHistory");

const router = express.Router();

const sanitizeText = (value) => String(value || "").trim().replace(/[<>$]/g, "");
const normalizeIdentifier = (value) => sanitizeText(value).toLowerCase();
const normalizeGenreIds = (genres) => {
  if (!Array.isArray(genres)) {
    return [];
  }

  return [...new Set(genres.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
};

const friendPublicFields = "_id username email createdAt";

router.get("/friends", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .populate("friends", friendPublicFields)
      .select("friends");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ friends: user.friends || [] });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Get friends error:", error);
    }
    return res.status(500).json({ message: "Failed to load friends" });
  }
});

router.post("/friends", auth, async (req, res) => {
  try {
    const identifier = normalizeIdentifier(req.body.identifier);

    if (!identifier) {
      return res.status(400).json({ message: "Friend username or email is required" });
    }

    const currentUser = await User.findById(req.userId).select("username email friends");
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (
      normalizeIdentifier(currentUser.username) === identifier
      || normalizeIdentifier(currentUser.email) === identifier
    ) {
      return res.status(400).json({ message: "You cannot add yourself as a friend" });
    }

    const safePattern = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const friend = await User.findOne({
      $or: [
        { username: { $regex: `^${safePattern}$`, $options: "i" } },
        { email: identifier },
      ],
    }).select(friendPublicFields);

    if (!friend) {
      return res.status(404).json({ message: "Friend account not found" });
    }

    const friendId = friend._id.toString();
    const alreadyFriend = (currentUser.friends || []).some((id) => id.toString() === friendId);
    if (alreadyFriend) {
      return res.status(409).json({ message: "Friend already added" });
    }

    currentUser.friends.push(new mongoose.Types.ObjectId(friendId));
    await currentUser.save();

    return res.status(201).json({
      message: "Friend added",
      friend,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Add friend error:", error);
    }
    return res.status(500).json({ message: "Failed to add friend" });
  }
});

router.delete("/friends/:friendId", auth, async (req, res) => {
  try {
    const friendId = sanitizeText(req.params.friendId);

    if (!mongoose.Types.ObjectId.isValid(friendId)) {
      return res.status(400).json({ message: "Invalid friend id" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        $pull: {
          friends: new mongoose.Types.ObjectId(friendId),
        },
      },
      { new: true }
    ).select("friends");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: "Friend removed" });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Remove friend error:", error);
    }
    return res.status(500).json({ message: "Failed to remove friend" });
  }
});

router.post("/preferences", auth, async (req, res) => {
  try {
    const genres = normalizeGenreIds(req.body.genres);
    const mood = sanitizeText(req.body.mood).slice(0, 40).toLowerCase();

    if (!genres.length && !mood) {
      return res.status(400).json({ message: "At least one preference value is required" });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        $set: {
          "preferences.genres": genres,
          "preferences.mood": mood,
        },
      },
      { new: true }
    ).select("-password -__v");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ message: "Preferences saved", user });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Save preferences error:", error);
    }
    return res.status(500).json({ message: "Failed to save preferences" });
  }
});

router.get("/history", auth, async (req, res) => {
  try {
    const history = await WatchHistory.find({ userId: req.userId })
      .sort({ watchedAt: -1 })
      .select("-__v");

    return res.json({ history });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Get history error:", error);
    }
    return res.status(500).json({ message: "Failed to load watch history" });
  }
});

router.post("/history", auth, async (req, res) => {
  try {
    const movieId = Number(req.body.movieId);
    const movieTitle = sanitizeText(req.body.movieTitle).slice(0, 200);
    const ratingValue = req.body.rating;
    const rating = ratingValue === undefined || ratingValue === null || ratingValue === ""
      ? null
      : Number(ratingValue);

    if (!Number.isInteger(movieId) || movieId <= 0) {
      return res.status(400).json({ message: "Invalid movie id" });
    }

    if (!movieTitle) {
      return res.status(400).json({ message: "Movie title is required" });
    }

    if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const historyItem = await WatchHistory.findOneAndUpdate(
      { userId: req.userId, movieId },
      {
        $set: {
          movieTitle,
          watchedAt: new Date(),
          rating,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).select("-__v");

    return res.status(201).json({ message: "Movie added to history", historyItem });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Add history error:", error);
    }
    return res.status(500).json({ message: "Failed to add history item" });
  }
});

router.delete("/history/:movieId", auth, async (req, res) => {
  try {
    const movieId = Number(req.params.movieId);
    if (!Number.isInteger(movieId) || movieId <= 0) {
      return res.status(400).json({ message: "Invalid movie id" });
    }

    const removed = await WatchHistory.findOneAndDelete({ userId: req.userId, movieId });

    if (!removed) {
      return res.status(404).json({ message: "History record not found" });
    }

    return res.json({ message: "History record removed" });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Delete history error:", error);
    }
    return res.status(500).json({ message: "Failed to remove history item" });
  }
});

router.post("/favorite", auth, async (req, res) => {
  try {
    const movieId = Number(req.body.movieId);

    if (!Number.isInteger(movieId) || movieId <= 0) {
      return res.status(400).json({ message: "Invalid movie id" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const favorites = user.preferences.favoriteMovies || [];
    const isFavorite = favorites.includes(movieId);

    user.preferences.favoriteMovies = isFavorite
      ? favorites.filter((id) => id !== movieId)
      : [...favorites, movieId];

    await user.save();

    return res.json({
      message: isFavorite ? "Removed from favorites" : "Added to favorites",
      favoriteMovies: user.preferences.favoriteMovies,
      isFavorite: !isFavorite,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Toggle favorite error:", error);
    }
    return res.status(500).json({ message: "Failed to update favorites" });
  }
});

module.exports = router;
