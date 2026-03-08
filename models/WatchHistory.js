const mongoose = require("mongoose");

const watchHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  movieId: {
    type: Number,
    required: true,
    index: true,
  },
  movieTitle: {
    type: String,
    required: true,
    trim: true,
  },
  watchedAt: {
    type: Date,
    default: Date.now,
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null,
  },
});

watchHistorySchema.index({ userId: 1, movieId: 1 }, { unique: true });

module.exports = mongoose.model("WatchHistory", watchHistorySchema);
