const API_BASE = "/api";
const TOKEN_KEY = "cm_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

const redirectToLogin = () => {
  clearToken();
  const currentPath = window.location.pathname.toLowerCase();
  if (!currentPath.endsWith("/index.html") && currentPath !== "/") {
    window.location.href = "/index.html";
  }
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
  } catch (error) {
    throw new Error("Network error. Please check your internet connection.");
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

    throw new Error(payload.message || `Request failed (${response.status})`);
  }

  return payload;
}

export const registerUser = (data) => apiRequest("/auth/register", { method: "POST", body: data, auth: false });

export const loginUser = (data) => apiRequest("/auth/login", { method: "POST", body: data, auth: false });

export const getCurrentUser = () => apiRequest("/auth/me");

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

export const getFriendRecommendations = () => apiRequest("/movies/recommend/friends");

export const savePreferences = (data) => apiRequest("/user/preferences", { method: "POST", body: data });

export const getWatchHistory = () => apiRequest("/user/history");

export const getFriends = () => apiRequest("/user/friends");

export const addFriend = (identifier) =>
  apiRequest("/user/friends", { method: "POST", body: { identifier } });

export const removeFriend = (friendId) => apiRequest(`/user/friends/${friendId}`, { method: "DELETE" });

export const addWatchHistory = (data) => apiRequest("/user/history", { method: "POST", body: data });

export const removeWatchHistory = (movieId) => apiRequest(`/user/history/${movieId}`, { method: "DELETE" });

export const toggleFavoriteMovie = (movieId) => apiRequest("/user/favorite", { method: "POST", body: { movieId } });
