const express = require("express");
const fetch = require("node-fetch");
const auth = require("../middleware/auth");
const User = require("../models/User");
const WatchHistory = require("../models/WatchHistory");
const { connectToDatabase } = require("../lib/database");
const { createConfigError, isMissingOrPlaceholder } = require("../lib/env");

const router = express.Router();

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || "netflix54.p.rapidapi.com";
const RAPIDAPI_BASE_URL = (
  process.env.RAPIDAPI_BASE_URL || `https://${RAPIDAPI_HOST}`
).replace(/\/+$/, "");
const DEFAULT_SEASON_IDS = (process.env.NETFLIX_DEFAULT_IDS || "80077209,80117715")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
const inFlightCache = new Map();

const genreIdToName = {
  12: "Adventure",
  16: "Animation",
  18: "Drama",
  27: "Horror",
  28: "Action",
  35: "Comedy",
  53: "Thriller",
  80: "Crime",
  878: "Science Fiction",
  9648: "Mystery",
  10749: "Romance",
};

const genreRules = [
  { id: 28, keywords: ["fight", "battle", "war", "attack", "chase", "weapon", "action"] },
  { id: 35, keywords: ["funny", "joke", "laugh", "hilarious", "comedy"] },
  { id: 27, keywords: ["monster", "ghost", "fear", "horror", "dark", "haunted"] },
  { id: 53, keywords: ["mystery", "secret", "danger", "thrill", "suspense"] },
  { id: 9648, keywords: ["mystery", "clue", "investigate", "unknown", "discovery"] },
  { id: 878, keywords: ["lab", "experiment", "dimension", "future", "science", "space"] },
  { id: 10749, keywords: ["love", "romance", "kiss", "relationship"] },
  { id: 18, keywords: ["family", "friend", "loss", "truth", "conflict"] },
];

const moodKeywordMap = {
  happy: ["funny", "friend", "celebration", "good"],
  romantic: ["love", "romance", "relationship"],
  sad: ["loss", "goodbye", "alone", "grief"],
  thriller: ["danger", "suspense", "threat"],
  action: ["fight", "attack", "battle"],
  comedy: ["comedy", "funny", "laugh"],
  horror: ["horror", "fear", "monster", "dark"],
  "sci-fi": ["lab", "experiment", "dimension", "science"],
  scifi: ["lab", "experiment", "dimension", "science"],
  mystery: ["mystery", "clue", "secret", "unknown"],
};

const sanitizeText = (value) => String(value || "").trim().replace(/[<>$]/g, "");
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parseNumberArray = (value) =>
  sanitizeText(value)
    .split(",")
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

const parseEpisodeId = (rawId) => {
  const value = Number(rawId);
  if (Number.isInteger(value) && value > 0) return value;

  const digits = String(rawId || "").replace(/\D/g, "");
  const parsed = Number(digits);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseAvailabilityDate = (timestamp) => {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const date = new Date(numeric);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const inferGenreIds = (title, overview) => {
  const haystack = `${String(title || "")} ${String(overview || "")}`.toLowerCase();
  const ids = [];

  for (const rule of genreRules) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) {
      ids.push(rule.id);
    }
  }

  if (!ids.length) {
    ids.push(18);
  }

  return [...new Set(ids)];
};

const getImageUrlFromEpisode = (episode) => {
  const candidates = [
    episode?.interestingMoment?._342x192?.webp?.value?.url,
    episode?.interestingMoment?._665x375?.webp?.value?.url,
    episode?.interestingMoment?._1280x720?.webp?.value?.url,
    episode?.interestingMoment?.url,
  ];

  const valid = candidates.find((url) => /^https?:\/\//i.test(String(url || "")));
  return valid || "";
};

const normalizeEpisode = (episode, seasonId) => {
  const title = episode?.title || `Episode ${episode?.summary?.episode || ""}`.trim();
  const overview = episode?.contextualSynopsis?.text || "";
  const episodeId = parseEpisodeId(episode?.episodeId || episode?.summary?.id);
  const runtimeSeconds = Number(episode?.runtime || episode?.displayRuntime || 0);
  const runtimeMinutes = runtimeSeconds > 0 ? Math.round(runtimeSeconds / 60) : null;
  const releaseDate = parseAvailabilityDate(episode?.availability?.availabilityStartTime);
  const popularityRaw = Number(episode?.bookmarkPosition);
  const popularity = Number.isFinite(popularityRaw) && popularityRaw > 0 ? popularityRaw : 0;
  const episodeNumber = Number(episode?.summary?.episode) || 0;
  const runtimeBump = runtimeMinutes ? Math.min(1.4, runtimeMinutes / 80) : 0.7;
  const popularityBump = popularity ? Math.min(2.1, Math.log10(popularity + 1) * 0.9) : 0.45;
  const episodeBump = episodeNumber ? Math.max(0.1, 0.9 - episodeNumber * 0.05) : 0.2;
  const derivedVoteAverage = Number(
    clamp(6 + runtimeBump + popularityBump + episodeBump, 5.6, 9.6).toFixed(1)
  );
  const derivedVoteCount = popularity
    ? Math.round(Math.max(150, popularity * 1.8))
    : 220 + episodeNumber * 14;
  const genreIds = inferGenreIds(title, overview);

  return {
    id: episodeId,
    season_id: parseEpisodeId(seasonId),
    episode_number: episodeNumber || null,
    title,
    original_title: title,
    overview,
    release_date: releaseDate,
    runtime: runtimeMinutes,
    vote_average: derivedVoteAverage,
    vote_count: derivedVoteCount,
    genre_ids: genreIds,
    genres: genreIds.map((id) => ({ id, name: genreIdToName[id] || "Genre" })),
    poster_path: getImageUrlFromEpisode(episode),
    backdrop_path: getImageUrlFromEpisode(episode),
    adult: false,
    popularity,
    tagline: "",
    budget: 0,
    revenue: 0,
    production_companies: [],
    spoken_languages: [{ english_name: "English" }],
    availability: episode?.availability || {},
  };
};

const withSortFallback = (movies) => {
  return movies.slice().sort((a, b) => {
    const seasonA = Number(a.season_id) || 0;
    const seasonB = Number(b.season_id) || 0;
    const episodeA = Number(a.episode_number) || 0;
    const episodeB = Number(b.episode_number) || 0;

    return seasonA - seasonB || episodeA - episodeB || (a.id || 0) - (b.id || 0);
  });
};

const uniqById = (items) => {
  const seen = new Map();
  for (const item of items) {
    if (!item?.id) continue;
    seen.set(item.id, item);
  }
  return [...seen.values()];
};

const getRapidApiKey = () => {
  const preferredKey = process.env.RAPIDAPI_KEY;
  const fallbackKey = process.env.X_RAPIDAPI_KEY;

  if (!isMissingOrPlaceholder(preferredKey)) {
    return preferredKey;
  }

  if (!isMissingOrPlaceholder(fallbackKey)) {
    return fallbackKey;
  }

  throw createConfigError(
    "RAPIDAPI_KEY is missing or still a placeholder in environment variables."
  );
};

const rapidRequest = async (path, query = {}) => {
  const url = new URL(`${RAPIDAPI_BASE_URL}${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": getRapidApiKey(),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "RapidAPI request failed");
  }

  if (!Array.isArray(payload)) {
    throw new Error("Unexpected response from RapidAPI");
  }

  return payload;
};

const getCached = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCached = (key, value) => {
  cache.set(key, {
    timestamp: Date.now(),
    value,
  });
};

const getSeasonEpisodesData = async ({ ids, offset, limit, lang } = {}) => {
  const seasonIds = (ids || DEFAULT_SEASON_IDS)
    .map((id) => sanitizeText(id))
    .filter(Boolean);

  const query = {
    ids: seasonIds.join(","),
    offset: Number.isFinite(Number(offset)) ? Number(offset) : 0,
    limit: clamp(Number(limit) || 25, 1, 100),
    lang: sanitizeText(lang) || "en",
  };

  const cacheKey = `season:${JSON.stringify(query)}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = inFlightCache.get(cacheKey);
  if (pending) {
    return pending;
  }

  const requestPromise = (async () => {
    const raw = await rapidRequest("/season/episodes/", query);
    const episodes = uniqById(
      raw.flatMap((seasonBlock) => {
        const seasonId = seasonBlock?.seasonId;
        const seasonEpisodes = Array.isArray(seasonBlock?.episodes)
          ? seasonBlock.episodes
          : [];
        return seasonEpisodes.map((episode) => normalizeEpisode(episode, seasonId));
      })
    ).filter((episode) => episode.id);

    const result = {
      query,
      raw,
      episodes: withSortFallback(episodes),
    };

    setCached(cacheKey, result);
    return result;
  })();

  inFlightCache.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightCache.delete(cacheKey);
  }
};

const toPageResult = (results) => ({
  page: 1,
  results,
  total_pages: 1,
  total_results: results.length,
});

const sendRouteError = (res, error, statusCode, fallbackMessage, logLabel) => {
  if (error.code === "CONFIG_ERROR") {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }

  if (process.env.NODE_ENV !== "production") {
    console.error(`${logLabel}:`, error.message);
  }

  return res.status(statusCode).json({ message: fallbackMessage });
};

router.get("/netflix/season-episodes", async (req, res) => {
  try {
    const ids = sanitizeText(req.query.ids || DEFAULT_SEASON_IDS.join(","))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const data = await getSeasonEpisodesData({
      ids,
      offset: req.query.offset,
      limit: req.query.limit,
      lang: req.query.lang,
    });

    return res.json({
      ...data,
      totalResults: data.episodes.length,
    });
  } catch (error) {
    return sendRouteError(
      res,
      error,
      502,
      "Failed to fetch season episodes from RapidAPI",
      "Netflix season episodes fetch error"
    );
  }
});

router.get("/trending", async (req, res) => {
  try {
    const data = await getSeasonEpisodesData({
      ids: DEFAULT_SEASON_IDS,
      offset: req.query.offset,
      limit: req.query.limit,
      lang: req.query.lang,
    });

    const results = withSortFallback(data.episodes);
    return res.json(toPageResult(results));
  } catch (error) {
    return sendRouteError(res, error, 502, "Failed to fetch trending content", "Trending fetch error");
  }
});

router.get("/popular", async (req, res) => {
  try {
    const data = await getSeasonEpisodesData({
      ids: DEFAULT_SEASON_IDS,
      offset: req.query.offset,
      limit: req.query.limit,
      lang: req.query.lang,
    });

    const results = data.episodes
      .slice()
      .sort((a, b) => (b.popularity - a.popularity) || (b.runtime || 0) - (a.runtime || 0));

    return res.json(toPageResult(results));
  } catch (error) {
    return sendRouteError(res, error, 502, "Failed to fetch popular content", "Popular fetch error");
  }
});

router.get("/top-rated", async (req, res) => {
  try {
    const data = await getSeasonEpisodesData({
      ids: DEFAULT_SEASON_IDS,
      offset: req.query.offset,
      limit: req.query.limit,
      lang: req.query.lang,
    });

    const results = data.episodes
      .slice()
      .sort((a, b) => (b.runtime || 0) - (a.runtime || 0) || (a.id - b.id));

    return res.json(toPageResult(results));
  } catch (error) {
    return sendRouteError(res, error, 502, "Failed to fetch top-rated content", "Top rated fetch error");
  }
});

router.get("/genres", async (_req, res) => {
  try {
    const genres = Object.entries(genreIdToName).map(([id, name]) => ({
      id: Number(id),
      name,
    }));

    return res.json({ genres });
  } catch (error) {
    return sendRouteError(res, error, 502, "Failed to fetch genres", "Genres fetch error");
  }
});

router.get("/search", async (req, res) => {
  try {
    const q = sanitizeText(req.query.q).toLowerCase();
    if (!q) {
      return res.json({ page: 1, results: [], total_pages: 0, total_results: 0 });
    }

    const data = await getSeasonEpisodesData({
      ids: DEFAULT_SEASON_IDS,
      offset: 0,
      limit: 50,
      lang: req.query.lang,
    });

    const results = data.episodes.filter((episode) => {
      const haystack = `${episode.title} ${episode.overview}`.toLowerCase();
      return haystack.includes(q);
    });

    return res.json(toPageResult(results));
  } catch (error) {
    return sendRouteError(res, error, 502, "Failed to search content", "Search fetch error");
  }
});

router.get("/recommend", async (req, res) => {
  try {
    const selectedMood = sanitizeText(req.query.mood).toLowerCase();
    const requestedGenres = parseNumberArray(req.query.genres || "");
    const maxRuntime = Number(req.query.maxRuntime);

    const data = await getSeasonEpisodesData({
      ids: DEFAULT_SEASON_IDS,
      offset: 0,
      limit: 50,
      lang: req.query.lang,
    });

    let results = data.episodes.slice();
    const keywords = moodKeywordMap[selectedMood] || [];

    const countIntersections = (left, right) => {
      const rightSet = new Set(right);
      let intersections = 0;
      for (const value of left) {
        if (rightSet.has(value)) intersections += 1;
      }
      return intersections;
    };

    if (requestedGenres.length) {
      const genreFiltered = results.filter((episode) =>
        episode.genre_ids.some((genreId) => requestedGenres.includes(genreId))
      );
      if (genreFiltered.length >= Math.min(6, results.length)) {
        results = genreFiltered;
      }
    }

    if (Number.isFinite(maxRuntime) && maxRuntime > 0) {
      const runtimeFiltered = results.filter((episode) =>
        Number.isFinite(episode.runtime) ? episode.runtime <= maxRuntime : true
      );
      if (runtimeFiltered.length >= Math.min(6, results.length)) {
        results = runtimeFiltered;
      }
    }

    const scored = results.map((episode) => {
      const haystack = `${episode.title} ${episode.overview}`.toLowerCase();
      const moodMatches = keywords.length
        ? keywords.reduce((total, keyword) => total + Number(haystack.includes(keyword)), 0)
        : 0;
      const genreMatches = requestedGenres.length
        ? countIntersections(episode.genre_ids, requestedGenres)
        : 0;
      const moodScore = keywords.length ? moodMatches / keywords.length : 0;
      const genreScore = requestedGenres.length
        ? genreMatches / requestedGenres.length
        : 0;
      const runtimeScore = Number.isFinite(maxRuntime) && maxRuntime > 0
        ? Number.isFinite(episode.runtime)
          ? episode.runtime <= maxRuntime
            ? 1
            : 0
          : 0.6
        : 0.6;
      const voteScore = clamp((Number(episode.vote_average) || 0) / 10, 0, 1);
      const popularityScore = clamp((Number(episode.popularity) || 0) / 2000, 0, 1);
      const finalScore = moodScore * 0.45
        + genreScore * 0.3
        + runtimeScore * 0.1
        + voteScore * 0.1
        + popularityScore * 0.05;

      return {
        ...episode,
        __score: Number(finalScore.toFixed(4)),
        __moodMatches: moodMatches,
      };
    });

    scored.sort((a, b) =>
      b.__score - a.__score
      || b.__moodMatches - a.__moodMatches
      || b.vote_average - a.vote_average
      || b.popularity - a.popularity
      || a.id - b.id
    );

    results = scored.map(({ __score, __moodMatches, ...episode }) => episode);

    return res.json({
      ...toPageResult(results),
      selectedMood,
      appliedGenres: requestedGenres,
      appliedMaxRuntime: Number.isFinite(maxRuntime) ? maxRuntime : null,
    });
  } catch (error) {
    return sendRouteError(
      res,
      error,
      502,
      "Failed to fetch recommendations",
      "Recommend fetch error"
    );
  }
});

router.get("/recommend/friends", auth, async (req, res) => {
  try {
    await connectToDatabase();

    const currentUser = await User.findById(req.userId).select("friends");
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const friendIds = (currentUser.friends || []).map((id) => id.toString());
    if (!friendIds.length) {
      return res.json({
        ...toPageResult([]),
        friendCount: 0,
        socialSignals: [],
        message: "Add friends to unlock social recommendations",
      });
    }

    const [friends, selfHistory, friendHistory] = await Promise.all([
      User.find({ _id: { $in: friendIds } }).select("_id username"),
      WatchHistory.find({ userId: req.userId }).select("movieId"),
      WatchHistory.find({ userId: { $in: friendIds } })
        .sort({ watchedAt: -1 })
        .select("userId movieId movieTitle watchedAt rating"),
    ]);

    const watchedIds = new Set(selfHistory.map((item) => item.movieId));
    const friendNameById = new Map(friends.map((friend) => [friend._id.toString(), friend.username]));
    const movieSignalMap = new Map();
    let latestWatchedAt = 0;

    for (const item of friendHistory) {
      latestWatchedAt = Math.max(latestWatchedAt, new Date(item.watchedAt).getTime() || 0);
      if (watchedIds.has(item.movieId)) continue;

      const key = item.movieId;
      const signal = movieSignalMap.get(key) || {
        movieId: key,
        movieTitle: item.movieTitle,
        watchCount: 0,
        ratingTotal: 0,
        ratingCount: 0,
        latestWatchedAt: 0,
        friendNames: [],
      };

      signal.watchCount += 1;
      if (Number.isFinite(item.rating)) {
        signal.ratingTotal += Number(item.rating);
        signal.ratingCount += 1;
      }

      const watchedAt = new Date(item.watchedAt).getTime() || 0;
      signal.latestWatchedAt = Math.max(signal.latestWatchedAt, watchedAt);

      const friendName = friendNameById.get(item.userId.toString());
      if (friendName && !signal.friendNames.includes(friendName)) {
        signal.friendNames.push(friendName);
      }

      movieSignalMap.set(key, signal);
    }

    const socialSignals = [...movieSignalMap.values()];
    if (!socialSignals.length) {
      return res.json({
        ...toPageResult([]),
        friendCount: friends.length,
        socialSignals: [],
        message: "Your friends have not watched anything new for you yet",
      });
    }

    const data = await getSeasonEpisodesData({
      ids: DEFAULT_SEASON_IDS,
      offset: 0,
      limit: 50,
      lang: req.query.lang,
    });

    const maxFriendWatchCount = socialSignals.reduce(
      (maxValue, item) => Math.max(maxValue, item.watchCount),
      1
    );

    const recommended = data.episodes
      .filter((episode) => movieSignalMap.has(episode.id))
      .map((episode) => {
        const signal = movieSignalMap.get(episode.id);
        const friendScore = signal.watchCount / maxFriendWatchCount;
        const ratingScore = signal.ratingCount
          ? clamp((signal.ratingTotal / signal.ratingCount) / 5, 0, 1)
          : 0.55;
        const recencyScore = latestWatchedAt && signal.latestWatchedAt
          ? clamp(signal.latestWatchedAt / latestWatchedAt, 0, 1)
          : 0.4;
        const popularityScore = clamp((Number(episode.popularity) || 0) / 2000, 0, 1);
        const finalScore = friendScore * 0.55
          + ratingScore * 0.2
          + recencyScore * 0.15
          + popularityScore * 0.1;

        return {
          ...episode,
          socialProof: {
            watchCount: signal.watchCount,
            friendNames: signal.friendNames.slice(0, 3),
            averageRating: signal.ratingCount
              ? Number((signal.ratingTotal / signal.ratingCount).toFixed(1))
              : null,
          },
          __score: Number(finalScore.toFixed(4)),
        };
      })
      .sort((a, b) =>
        b.__score - a.__score
        || (b.socialProof?.watchCount || 0) - (a.socialProof?.watchCount || 0)
        || b.vote_average - a.vote_average
        || b.popularity - a.popularity
        || a.id - b.id
      );

    return res.json({
      ...toPageResult(recommended.map(({ __score, ...episode }) => episode)),
      friendCount: friends.length,
      socialSignals: socialSignals
        .sort((a, b) => b.watchCount - a.watchCount || b.latestWatchedAt - a.latestWatchedAt)
        .slice(0, 12)
        .map((item) => ({
          movieId: item.movieId,
          movieTitle: item.movieTitle,
          watchCount: item.watchCount,
          friendNames: item.friendNames.slice(0, 3),
        })),
    });
  } catch (error) {
    return sendRouteError(
      res,
      error,
      500,
      "Failed to fetch friend recommendations",
      "Friend recommendations fetch error"
    );
  }
});

router.get("/:id/trailer", async (_req, res) => {
  return res.json({
    key: null,
    name: "Trailer unavailable",
    provider: "netflix54",
    message: "Trailer data is not available in this RapidAPI endpoint",
  });
});

router.get("/:id", async (req, res) => {
  try {
    const requestedId = parseEpisodeId(req.params.id);
    if (!requestedId) {
      return res.status(400).json({ message: "Invalid movie id" });
    }

    const data = await getSeasonEpisodesData({
      ids: DEFAULT_SEASON_IDS,
      offset: 0,
      limit: 50,
      lang: req.query.lang,
    });

    const current = data.episodes.find((episode) => episode.id === requestedId);

    if (!current) {
      return res.status(404).json({ message: "Movie not found" });
    }

    const similar = data.episodes
      .filter((episode) => episode.id !== requestedId)
      .filter((episode) =>
        episode.season_id === current.season_id ||
        episode.genre_ids.some((genreId) => current.genre_ids.includes(genreId))
      )
      .slice(0, 12);

    return res.json({
      ...current,
      videos: { results: [] },
      credits: { cast: [] },
      similar: { results: similar },
      original_language: "en",
    });
  } catch (error) {
    return sendRouteError(res, error, 502, "Failed to fetch movie details", "Movie details fetch error");
  }
});

module.exports = router;
