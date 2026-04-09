const API_BASE = "/api";
const TOKEN_KEY = "cm_token";
const LOCAL_USERS_KEY = "cm_local_users";
const LOCAL_HISTORY_KEY = "cm_local_history";
const LOCAL_TOKEN_PREFIX = "local:";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pageResult = (results = []) => ({
  page: 1,
  results,
  total_pages: 1,
  total_results: results.length,
});

const readJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
};

const writeJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const sanitizeText = (value) => String(value || "").trim().replace(/[<>$]/g, "");
const sanitizeEmail = (value) => sanitizeText(value).toLowerCase();
const createLocalId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const createLocalToken = (userId) => `${LOCAL_TOKEN_PREFIX}${userId}`;
const isLocalToken = (token) => String(token || "").startsWith(LOCAL_TOKEN_PREFIX);
const getLocalUserId = (token = getToken()) =>
  isLocalToken(token) ? token.slice(LOCAL_TOKEN_PREFIX.length) : null;

const getLocalUsers = () => readJson(LOCAL_USERS_KEY, []);
const saveLocalUsers = (users) => writeJson(LOCAL_USERS_KEY, users);
const getLocalHistoryStore = () => readJson(LOCAL_HISTORY_KEY, []);
const saveLocalHistoryStore = (items) => writeJson(LOCAL_HISTORY_KEY, items);

const toSafeUser = (user) => {
  const { password, ...safeUser } = user;
  return clone(safeUser);
};

const createHttpError = (message, status = 500) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const getCurrentLocalUserRecord = () => {
  const userId = getLocalUserId();
  if (!userId) return null;
  return getLocalUsers().find((user) => user._id === userId) || null;
};

const requireCurrentLocalUser = () => {
  const user = getCurrentLocalUserRecord();
  if (!user) {
    throw createHttpError("Authorization token missing", 401);
  }
  return user;
};

const isRecoverableRemoteFailure = (error) => {
  const message = String(error?.message || "");
  return Number(error?.status) >= 500
    || /database connection failed/i.test(message)
    || /internal server error/i.test(message)
    || /network error/i.test(message);
};

const redirectToLogin = () => {
  clearToken();
  const currentPath = window.location.pathname.toLowerCase();
  if (!currentPath.endsWith("/index.html") && currentPath !== "/") {
    window.location.href = "/index.html";
  }
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export async function apiRequest(path, { method = "GET", body, auth = true } = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (_error) {
    throw createHttpError("Network error. Please check your internet connection.", 503);
  }

  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      redirectToLogin();
    }

    throw createHttpError(payload.message || `Request failed (${response.status})`, response.status);
  }

  return payload;
}

const registerLocalUser = ({ username, email, password }) => {
  const cleanUsername = sanitizeText(username);
  const cleanEmail = sanitizeEmail(email);
  const cleanPassword = String(password || "");

  if (cleanUsername.length < 3) {
    throw createHttpError("Username must be at least 3 characters", 400);
  }

  if (!emailRegex.test(cleanEmail)) {
    throw createHttpError("Please enter a valid email", 400);
  }

  if (cleanPassword.length < 6) {
    throw createHttpError("Password must be at least 6 characters", 400);
  }

  const users = getLocalUsers();
  if (users.some((user) => sanitizeEmail(user.email) === cleanEmail)) {
    throw createHttpError("Email already exists", 409);
  }

  if (users.some((user) => sanitizeText(user.username).toLowerCase() === cleanUsername.toLowerCase())) {
    throw createHttpError("Username already exists", 409);
  }

  const user = {
    _id: createLocalId(),
    username: cleanUsername,
    email: cleanEmail,
    password: cleanPassword,
    preferences: { genres: [], mood: "", favoriteMovies: [] },
    friends: [],
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  saveLocalUsers(users);

  return {
    token: createLocalToken(user._id),
    user: toSafeUser(user),
    demoMode: true,
  };
};

const loginLocalUser = ({ email, password }) => {
  const cleanEmail = sanitizeEmail(email);
  const cleanPassword = String(password || "");

  if (!emailRegex.test(cleanEmail)) {
    throw createHttpError("Please enter a valid email", 400);
  }

  if (!cleanPassword) {
    throw createHttpError("Password is required", 400);
  }

  const user = getLocalUsers().find((item) => sanitizeEmail(item.email) === cleanEmail);
  if (!user) {
    throw createHttpError("User not found", 404);
  }

  if (String(user.password) !== cleanPassword) {
    throw createHttpError("Wrong password", 401);
  }

  return {
    token: createLocalToken(user._id),
    user: toSafeUser(user),
    demoMode: true,
  };
};

const getLocalCurrentUser = () => {
  const user = requireCurrentLocalUser();
  return { user: toSafeUser(user), demoMode: true };
};

const updateLocalUser = (updater) => {
  const currentUser = requireCurrentLocalUser();
  const users = getLocalUsers();
  const index = users.findIndex((user) => user._id === currentUser._id);
  if (index === -1) {
    throw createHttpError("User not found", 404);
  }

  const updated = updater(clone(users[index]));
  users[index] = updated;
  saveLocalUsers(users);
  return updated;
};

const getLocalHistory = () => {
  const currentUser = requireCurrentLocalUser();
  return getLocalHistoryStore()
    .filter((item) => item.userId === currentUser._id)
    .sort((left, right) => new Date(right.watchedAt) - new Date(left.watchedAt));
};

const getLocalFriendObjects = () => {
  const currentUser = requireCurrentLocalUser();
  const users = getLocalUsers();
  return users
    .filter((user) => (currentUser.friends || []).includes(user._id))
    .map((user) => toSafeUser(user));
};

const buildLocalFriendRecommendations = () => {
  const currentUser = requireCurrentLocalUser();
  const history = getLocalHistoryStore();
  const ownMovieIds = new Set(
    history.filter((item) => item.userId === currentUser._id).map((item) => item.movieId)
  );
  const friendIds = currentUser.friends || [];
  const signalMap = new Map();
  const usersById = new Map(getLocalUsers().map((user) => [user._id, user]));

  history
    .filter((item) => friendIds.includes(item.userId))
    .filter((item) => !ownMovieIds.has(item.movieId))
    .forEach((item) => {
      const entry = signalMap.get(item.movieId) || {
        movieId: item.movieId,
        movieTitle: item.movieTitle,
        watchCount: 0,
        friendNames: [],
      };

      entry.watchCount += 1;
      const friendName = usersById.get(item.userId)?.username;
      if (friendName && !entry.friendNames.includes(friendName)) {
        entry.friendNames.push(friendName);
      }

      signalMap.set(item.movieId, entry);
    });

  return {
    ...pageResult([]),
    friendCount: friendIds.length,
    socialSignals: [...signalMap.values()].slice(0, 12),
    message: signalMap.size
      ? "Friend activity is available in local mode, but synced recommendations need the database."
      : "Add friends in this browser to unlock local friend activity.",
  };
};

export const registerUser = async (data) => {
  try {
    return await apiRequest("/auth/register", { method: "POST", body: data, auth: false });
  } catch (error) {
    if (!isRecoverableRemoteFailure(error)) throw error;
    return registerLocalUser(data);
  }
};

export const loginUser = async (data) => {
  try {
    return await apiRequest("/auth/login", { method: "POST", body: data, auth: false });
  } catch (error) {
    if (!isRecoverableRemoteFailure(error)) throw error;
    return loginLocalUser(data);
  }
};

export const getCurrentUser = async () => {
  if (isLocalToken(getToken())) {
    return getLocalCurrentUser();
  }

  return apiRequest("/auth/me");
};

export const getTrendingMovies = () => apiRequest("/movies/trending");

export const getPopularMovies = () => apiRequest("/movies/popular");

export const getTopRatedMovies = () => apiRequest("/movies/top-rated");

export const getMovieGenres = () => apiRequest("/movies/genres");

export const searchMoviesApi = (query) =>
  apiRequest(`/movies/search?q=${encodeURIComponent(query || "")}`);

export const getMovieDetails = (id) => apiRequest(`/movies/${id}`);

export const getMovieTrailer = (id) => apiRequest(`/movies/${id}/trailer`);

export const getRecommendations = ({ genres = [], mood = "", maxRuntime } = {}) => {
  const params = new URLSearchParams();

  if (Array.isArray(genres) && genres.length) {
    params.set("genres", genres.join(","));
  }

  if (mood) {
    params.set("mood", mood);
  }

  if (maxRuntime) {
    params.set("maxRuntime", String(maxRuntime));
  }

  const query = params.toString();
  return apiRequest(`/movies/recommend${query ? `?${query}` : ""}`);
};

export const getFriendRecommendations = async () => {
  if (isLocalToken(getToken())) {
    return buildLocalFriendRecommendations();
  }

  return apiRequest("/movies/recommend/friends");
};

export const savePreferences = async (data) => {
  if (!isLocalToken(getToken())) {
    return apiRequest("/user/preferences", { method: "POST", body: data });
  }

  const genres = Array.isArray(data?.genres)
    ? [...new Set(data.genres.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  const mood = sanitizeText(data?.mood).slice(0, 40).toLowerCase();

  if (!genres.length && !mood) {
    throw createHttpError("At least one preference value is required", 400);
  }

  const updated = updateLocalUser((user) => ({
    ...user,
    preferences: {
      ...(user.preferences || {}),
      genres,
      mood,
    },
  }));

  return { message: "Preferences saved", user: toSafeUser(updated), demoMode: true };
};

export const getWatchHistory = async () => {
  if (!isLocalToken(getToken())) {
    return apiRequest("/user/history");
  }

  return { history: getLocalHistory(), demoMode: true };
};

export const getFriends = async () => {
  if (!isLocalToken(getToken())) {
    return apiRequest("/user/friends");
  }

  return { friends: getLocalFriendObjects(), demoMode: true };
};

export const addFriend = async (identifier) => {
  if (!isLocalToken(getToken())) {
    return apiRequest("/user/friends", { method: "POST", body: { identifier } });
  }

  const cleanIdentifier = sanitizeText(identifier).toLowerCase();
  if (!cleanIdentifier) {
    throw createHttpError("Friend username or email is required", 400);
  }

  const currentUser = requireCurrentLocalUser();
  const users = getLocalUsers();
  const friend = users.find((user) =>
    user._id !== currentUser._id
    && (
      sanitizeText(user.username).toLowerCase() === cleanIdentifier
      || sanitizeEmail(user.email) === cleanIdentifier
    )
  );

  if (!friend) {
    throw createHttpError("Friend account not found", 404);
  }

  if ((currentUser.friends || []).includes(friend._id)) {
    throw createHttpError("Friend already added", 409);
  }

  updateLocalUser((user) => ({
    ...user,
    friends: [...(user.friends || []), friend._id],
  }));

  return { message: "Friend added", friend: toSafeUser(friend), demoMode: true };
};

export const removeFriend = async (friendId) => {
  if (!isLocalToken(getToken())) {
    return apiRequest(`/user/friends/${friendId}`, { method: "DELETE" });
  }

  updateLocalUser((user) => ({
    ...user,
    friends: (user.friends || []).filter((id) => id !== friendId),
  }));

  return { message: "Friend removed", demoMode: true };
};

export const addWatchHistory = async (data) => {
  if (!isLocalToken(getToken())) {
    return apiRequest("/user/history", { method: "POST", body: data });
  }

  const currentUser = requireCurrentLocalUser();
  const movieId = Number(data?.movieId);
  const movieTitle = sanitizeText(data?.movieTitle).slice(0, 200);
  const ratingValue = data?.rating;
  const rating = ratingValue === undefined || ratingValue === null || ratingValue === ""
    ? null
    : Number(ratingValue);

  if (!Number.isInteger(movieId) || movieId <= 0) {
    throw createHttpError("Invalid movie id", 400);
  }

  if (!movieTitle) {
    throw createHttpError("Movie title is required", 400);
  }

  if (rating !== null && (!Number.isFinite(rating) || rating < 1 || rating > 5)) {
    throw createHttpError("Rating must be between 1 and 5", 400);
  }

  const history = getLocalHistoryStore();
  const existingIndex = history.findIndex(
    (item) => item.userId === currentUser._id && item.movieId === movieId
  );
  const historyItem = {
    userId: currentUser._id,
    movieId,
    movieTitle,
    watchedAt: new Date().toISOString(),
    rating,
  };

  if (existingIndex >= 0) {
    history[existingIndex] = historyItem;
  } else {
    history.push(historyItem);
  }

  saveLocalHistoryStore(history);

  return { message: "Movie added to history", historyItem: clone(historyItem), demoMode: true };
};

export const removeWatchHistory = async (movieId) => {
  if (!isLocalToken(getToken())) {
    return apiRequest(`/user/history/${movieId}`, { method: "DELETE" });
  }

  const currentUser = requireCurrentLocalUser();
  const parsedMovieId = Number(movieId);
  const history = getLocalHistoryStore();
  const nextHistory = history.filter(
    (item) => !(item.userId === currentUser._id && item.movieId === parsedMovieId)
  );

  if (nextHistory.length === history.length) {
    throw createHttpError("History record not found", 404);
  }

  saveLocalHistoryStore(nextHistory);
  return { message: "History record removed", demoMode: true };
};

export const toggleFavoriteMovie = async (movieId) => {
  if (!isLocalToken(getToken())) {
    return apiRequest("/user/favorite", { method: "POST", body: { movieId } });
  }

  const parsedMovieId = Number(movieId);
  if (!Number.isInteger(parsedMovieId) || parsedMovieId <= 0) {
    throw createHttpError("Invalid movie id", 400);
  }

  const updated = updateLocalUser((user) => {
    const favorites = user.preferences?.favoriteMovies || [];
    const isFavorite = favorites.includes(parsedMovieId);
    return {
      ...user,
      preferences: {
        ...(user.preferences || {}),
        favoriteMovies: isFavorite
          ? favorites.filter((id) => id !== parsedMovieId)
          : [...favorites, parsedMovieId],
      },
    };
  });

  const favoriteMovies = updated.preferences?.favoriteMovies || [];
  const isFavorite = favoriteMovies.includes(parsedMovieId);

  return {
    message: isFavorite ? "Added to favorites" : "Removed from favorites",
    favoriteMovies,
    isFavorite,
    demoMode: true,
  };
};
