import {
  addFriend,
  addWatchHistory,
  clearToken,
  getFriendRecommendations,
  getFriends,
  getCurrentUser,
  getMovieGenres,
  getMovieTrailer,
  getPopularMovies,
  getRecommendations,
  getTopRatedMovies,
  getTrendingMovies,
  getWatchHistory,
  removeFriend,
  removeWatchHistory,
  savePreferences,
  searchMoviesApi,
} from "./api.js";
import {
  createCardSkeletons,
  debounce,
  deduplicateMovies,
  escapeHtml,
  getBackdropUrl,
  getPosterUrl,
  getTopN,
  getYear,
  renderGenrePill,
  searchMovies as localTrieSearch,
  showToast,
  sortByRating,
  toStarRating,
} from "./utils.js";

const state = {
  user: null,
  genres: [],
  genreMap: new Map(),
  trending: [],
  topRated: [],
  popular: [],
  searchResults: [],
  friends: [],
  currentMood: "happy",
};

const moodOptions = [
  { label: "Happy &#128516;", value: "happy" },
  { label: "Romantic &#128149;", value: "romantic" },
  { label: "Sad &#128546;", value: "sad" },
  { label: "Thriller &#128560;", value: "thriller" },
  { label: "Action &#128293;", value: "action" },
  { label: "Comedy &#128514;", value: "comedy" },
  { label: "Horror &#128123;", value: "horror" },
  { label: "Sci-Fi &#128640;", value: "sci-fi" },
  { label: "Mystery &#128269;", value: "mystery" },
];

const heroSection = document.getElementById("heroSection");
const tabsNav = document.getElementById("tabsNav");
const moodButtonsWrap = document.getElementById("moodButtons");
const moodGrid = document.getElementById("moodGrid");
const friendGrid = document.getElementById("friendGrid");
const topRatedGrid = document.getElementById("topRatedGrid");
const quickWatchGrid = document.getElementById("quickWatchGrid");
const trendingGrid = document.getElementById("trendingGrid");
const searchGrid = document.getElementById("searchGrid");
const friendSummary = document.getElementById("friendSummary");
const friendForm = document.getElementById("friendForm");
const friendIdentifier = document.getElementById("friendIdentifier");
const friendList = document.getElementById("friendList");
const friendInsights = document.getElementById("friendInsights");

const runtimeSlider = document.getElementById("runtimeSlider");
const runtimeValue = document.getElementById("runtimeValue");
const quickMatchCount = document.getElementById("quickMatchCount");

const searchInput = document.getElementById("searchInput");
const searchSummary = document.getElementById("searchSummary");

const trailerModal = document.getElementById("trailerModal");
const trailerFrame = document.getElementById("trailerFrame");
const modalMovieTitle = document.getElementById("modalMovieTitle");
const closeTrailerModalBtn = document.getElementById("closeTrailerModal");

const onboardingModal = document.getElementById("onboardingModal");
const genreOptions = document.getElementById("genreOptions");
const savePreferencesBtn = document.getElementById("savePreferencesBtn");
const dismissPreferencesBtn = document.getElementById("dismissPreferencesBtn");
const skipOnboardingBtn = document.getElementById("skipOnboarding");

const userToggle = document.getElementById("userToggle");
const userDropdown = document.getElementById("userDropdown");
const userNameEl = document.getElementById("userName");
const userAvatar = document.getElementById("userAvatar");

const profileBtn = document.getElementById("profileBtn");
const historyBtn = document.getElementById("historyBtn");
const logoutBtn = document.getElementById("logoutBtn");

const historyModal = document.getElementById("historyModal");
const historyList = document.getElementById("historyList");
const closeHistoryModal = document.getElementById("closeHistoryModal");

const topRatedFilters = document.getElementById("topRatedFilters");

const activateTab = (tabId) => {
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === tabId);
  });
};

const getPrimaryGenre = (movie) => {
  const genreId = Array.isArray(movie.genre_ids)
    ? movie.genre_ids[0]
    : Array.isArray(movie.genres)
      ? movie.genres[0]?.id
      : null;

  const genreName = state.genreMap.get(genreId) || "Unknown";
  return { genreId, genreName };
};

const renderMovieCards = (container, movies, options = {}) => {
  if (!container) return;

  if (!movies.length) {
    container.innerHTML = `<div class="empty-state">No movies found for this section.</div>`;
    return;
  }

  container.innerHTML = movies
    .map((movie, index) => {
      const { genreId, genreName } = getPrimaryGenre(movie);
      const year = getYear(movie.release_date);
      const starRating = toStarRating(movie.vote_average);
      const duration = Number(movie.runtime);
      const durationText = Number.isFinite(duration) && duration > 0 ? `${duration}m` : "N/A";
      const posterPath = getPosterUrl(movie.poster_path, "w500");
      const rankBadge = options.showRank ? `<span class="rank-badge">#${index + 1}</span>` : "";
      const socialProofText = typeof options.socialProofFormatter === "function"
        ? options.socialProofFormatter(movie)
        : "";

      return `
        <article class="movie-card" data-id="${movie.id}" data-title="${escapeHtml(movie.title || "Movie")}">
          <div class="movie-thumb-wrap">
            ${
              posterPath
                ? `<img class="movie-thumb" src="${posterPath}" alt="${escapeHtml(movie.title || "Movie poster")}" onerror="this.outerHTML='<div class=\\'poster-fallback\\'>&#127916;</div>'"/>`
                : `<div class="poster-fallback">&#127916;</div>`
            }
            ${rankBadge}
            <button class="trailer-overlay" data-trailer="${movie.id}" data-title="${escapeHtml(movie.title || "Movie")}">&#9654; Trailer</button>
          </div>
          <div class="movie-content">
            <h3 class="movie-title">${escapeHtml(movie.title || "Untitled")}</h3>
            <div class="star-rating" style="--rating:${starRating}"></div>
            <div class="movie-meta">
              ${renderGenrePill(genreId, genreName)}
              <span>${year}</span>
              <span>${durationText}</span>
            </div>
            ${socialProofText ? `<div class="social-proof">${escapeHtml(socialProofText)}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll(".movie-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      const trailerBtn = event.target.closest("[data-trailer]");
      if (trailerBtn) {
        event.stopPropagation();
        openTrailerModal(Number(trailerBtn.dataset.trailer), trailerBtn.dataset.title || "Trailer");
        return;
      }

      const movieId = Number(card.dataset.id);
      if (Number.isFinite(movieId)) {
        window.location.href = `/movie.html?id=${movieId}`;
      }
    });
  });
};

const renderHero = (movie) => {
  if (!movie) {
    heroSection.classList.remove("skeleton");
    heroSection.style.backgroundImage = "none";
    heroSection.innerHTML = `<div class="hero-content"><h1>No featured movie</h1></div>`;
    return;
  }

  const backdrop = getBackdropUrl(movie.backdrop_path, "w1280");
  const starRating = toStarRating(movie.vote_average);
  const genres = (movie.genre_ids || []).slice(0, 3);

  heroSection.classList.remove("skeleton");
  heroSection.style.backgroundImage = backdrop ? `url('${backdrop}')` : "none";
  heroSection.innerHTML = `
    <div class="hero-content slide-up">
      <h1>${escapeHtml(movie.title || "Featured")}</h1>
      <div class="hero-meta">
        <span class="star-rating" style="--rating:${starRating}"></span>
        <span>${getYear(movie.release_date)}</span>
        <span>${Number(movie.vote_count || 0).toLocaleString()} votes</span>
      </div>
      <div class="genre-row">
        ${genres
          .map((genreId) => renderGenrePill(genreId, state.genreMap.get(genreId) || "Genre"))
          .join("")}
      </div>
      <p class="hero-description">${escapeHtml(movie.overview || "No description available.")}</p>
      <div class="hero-actions">
        <button class="btn btn-primary" id="heroTrailerBtn">&#9654; Watch Trailer</button>
        <button class="btn btn-secondary" id="heroInfoBtn">&#9432; More Info</button>
      </div>
    </div>
  `;

  const trailerBtn = document.getElementById("heroTrailerBtn");
  const infoBtn = document.getElementById("heroInfoBtn");

  trailerBtn?.addEventListener("click", () => {
    openTrailerModal(movie.id, movie.title || "Trailer");
  });

  infoBtn?.addEventListener("click", () => {
    window.location.href = `/movie.html?id=${movie.id}`;
  });
};

const closeTrailerModal = () => {
  trailerFrame.src = "";
  trailerModal.classList.add("hidden");
};

const openTrailerModal = async (movieId, movieTitle) => {
  if (!Number.isFinite(movieId)) return;

  try {
    const trailer = await getMovieTrailer(movieId);
    if (!trailer?.key) {
      showToast(trailer?.message || "Trailer unavailable for this title", "info");
      return;
    }

    trailerFrame.src = `https://www.youtube.com/embed/${trailer.key}?autoplay=1`;
    modalMovieTitle.textContent = movieTitle || "Trailer";
    trailerModal.classList.remove("hidden");

    await addWatchHistory({
      movieId,
      movieTitle,
    });
  } catch (error) {
    showToast(error.message || "Trailer unavailable", "error");
  }
};

const renderMoodButtons = () => {
  moodButtonsWrap.innerHTML = moodOptions
    .map(
      (mood) => `
      <button class="mood-btn ${state.currentMood === mood.value ? "active" : ""}" data-mood="${mood.value}">
        ${mood.label}
      </button>
    `
    )
    .join("");

  moodButtonsWrap.querySelectorAll(".mood-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const selectedMood = button.dataset.mood;
      state.currentMood = selectedMood;
      renderMoodButtons();
      await loadMoodRecommendations(selectedMood);

      const preferredGenres = state.user?.preferences?.genres || [];
      savePreferences({ genres: preferredGenres, mood: selectedMood }).catch(() => {
        console.error("Failed to sync mood preference");
      });
    });
  });
};

const loadMoodRecommendations = async (mood) => {
  moodGrid.innerHTML = createCardSkeletons(8);

  try {
    const preferredGenres = state.user?.preferences?.genres || [];
    const data = await getRecommendations({ genres: preferredGenres, mood });
    const movies = getTopN(sortByRating(deduplicateMovies(data.results || [])), 24);
    renderMovieCards(moodGrid, movies);
  } catch (error) {
    moodGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
};

const renderFriendList = () => {
  if (!state.friends.length) {
    friendList.innerHTML = `<div class="empty-state">No friends added yet.</div>`;
    return;
  }

  friendList.innerHTML = state.friends
    .map(
      (friend) => `
        <div class="friend-chip">
          <div>
            <strong>${escapeHtml(friend.username || "Friend")}</strong>
            <span>${escapeHtml(friend.email || "")}</span>
          </div>
          <button type="button" data-remove-friend="${friend._id}">Remove</button>
        </div>
      `
    )
    .join("");

  friendList.querySelectorAll("[data-remove-friend]").forEach((button) => {
    button.addEventListener("click", async () => {
      const friendId = button.dataset.removeFriend;
      try {
        await removeFriend(friendId);
        state.friends = state.friends.filter((friend) => friend._id !== friendId);
        renderFriendList();
        await loadFriendRecommendations();
        showToast("Friend removed", "success");
      } catch (error) {
        showToast(error.message || "Failed to remove friend", "error");
      }
    });
  });
};

const renderFriendInsights = (signals = []) => {
  if (!signals.length) {
    friendInsights.innerHTML = "";
    return;
  }

  friendInsights.innerHTML = signals
    .slice(0, 6)
    .map((signal) => {
      const names = Array.isArray(signal.friendNames) && signal.friendNames.length
        ? signal.friendNames.join(", ")
        : "Your network";
      return `
        <div class="friend-insight">
          <strong>${escapeHtml(signal.movieTitle || "Recommended")}</strong>
          <span>Watched by ${signal.watchCount} friend(s)</span>
          <span>${escapeHtml(names)}</span>
        </div>
      `;
    })
    .join("");
};

const loadFriendRecommendations = async () => {
  friendGrid.innerHTML = createCardSkeletons(6);

  try {
    const data = await getFriendRecommendations();
    const movies = deduplicateMovies(data.results || []);
    const friendCount = Number(data.friendCount || state.friends.length || 0);

    friendSummary.textContent = friendCount
      ? `${friendCount} friend(s) connected. These picks are based on titles your friends watched and you have not watched yet.`
      : "Add friends by username or email and get movies they watched before you.";

    renderFriendInsights(data.socialSignals || []);

    if (!movies.length) {
      friendGrid.innerHTML = `<div class="empty-state">${escapeHtml(data.message || "No friend-based recommendations yet.")}</div>`;
      return;
    }

    renderMovieCards(friendGrid, movies, {
      socialProofFormatter: (movie) => {
        const watchCount = movie.socialProof?.watchCount || 0;
        const names = Array.isArray(movie.socialProof?.friendNames)
          ? movie.socialProof.friendNames.join(", ")
          : "";

        if (!watchCount) return "";
        return names
          ? `${watchCount} friend(s): ${names}`
          : `${watchCount} friend(s) watched this`;
      },
    });
  } catch (error) {
    friendSummary.textContent = "Friend recommendations are unavailable right now.";
    friendInsights.innerHTML = "";
    friendGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
};

const applyTopRatedFilter = (filter) => {
  const nowYear = String(new Date().getFullYear());
  let list = state.topRated.slice();

  if (filter === "year") {
    list = list.filter((movie) => getYear(movie.release_date) === nowYear);
  } else if (filter === "awards") {
    list = list.filter((movie) => Number(movie.vote_average) >= 8.5 && Number(movie.vote_count) >= 2500);
  } else if (filter === "all-time") {
    list = sortByRating(list);
  }

  renderMovieCards(topRatedGrid, getTopN(list, 30));
};

const loadQuickWatch = async (maxRuntime) => {
  quickWatchGrid.innerHTML = createCardSkeletons(8);

  try {
    const preferredGenres = state.user?.preferences?.genres || [];
    const data = await getRecommendations({ genres: preferredGenres, maxRuntime });
    const movies = deduplicateMovies(data.results || []);
    quickMatchCount.textContent = `Matching Movies: ${movies.length}`;
    renderMovieCards(quickWatchGrid, movies);
  } catch (error) {
    quickWatchGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    quickMatchCount.textContent = "Matching Movies: 0";
  }
};

const debouncedQuickWatch = debounce(() => {
  const maxRuntime = Number(runtimeSlider.value);
  runtimeValue.textContent = `Max Runtime: ${maxRuntime} min`;
  loadQuickWatch(maxRuntime);
}, 320);

const setupTopRatedFilters = () => {
  topRatedFilters.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      topRatedFilters.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.remove("active"));
      button.classList.add("active");
      applyTopRatedFilter(button.dataset.filter);
    });
  });
};

const runSearch = debounce(async (queryValue) => {
  const query = queryValue.trim();

  if (!query) {
    searchSummary.textContent = "Start typing in the search bar to find movies.";
    searchGrid.innerHTML = "";
    return;
  }

  activateTab("searchTab");
  searchGrid.innerHTML = createCardSkeletons(6);

  try {
    const remote = await searchMoviesApi(query);
    const localResults = localTrieSearch(
      deduplicateMovies([...state.trending, ...state.topRated, ...state.popular]),
      query
    );

    const merged = deduplicateMovies([...(remote.results || []), ...localResults]);
    state.searchResults = merged;
    searchSummary.textContent = `${merged.length} result(s) for "${query}"`;
    renderMovieCards(searchGrid, merged);
  } catch (error) {
    searchSummary.textContent = "Search failed. Please try again.";
    searchGrid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}, 500);

const renderGenreOptions = () => {
  genreOptions.innerHTML = state.genres
    .map(
      (genre) => `
      <label class="checkbox-chip">
        <input type="checkbox" value="${genre.id}" />
        <span>${escapeHtml(genre.name)}</span>
      </label>
    `
    )
    .join("");
};

const maybeShowOnboarding = () => {
  const hasPreferences = (state.user?.preferences?.genres || []).length > 0;
  if (!hasPreferences) {
    renderGenreOptions();
    onboardingModal.classList.remove("hidden");
  }
};

const saveOnboardingPreferences = async () => {
  const selectedGenres = Array.from(genreOptions.querySelectorAll("input:checked")).map((input) => Number(input.value));

  try {
    const payload = {
      genres: selectedGenres,
      mood: state.user?.preferences?.mood || state.currentMood,
    };
    const response = await savePreferences(payload);
    state.user = response.user;
    onboardingModal.classList.add("hidden");
    showToast("Preferences saved", "success");
    loadMoodRecommendations(state.currentMood);
  } catch (error) {
    showToast(error.message, "error");
  }
};

const loadHistory = async () => {
  historyList.innerHTML = `<div class="skeleton" style="height:80px; border-radius:10px;"></div>`;

  try {
    const data = await getWatchHistory();
    const history = data.history || [];

    if (!history.length) {
      historyList.innerHTML = `<div class="empty-state">No watch history yet.</div>`;
      return;
    }

    historyList.innerHTML = history
      .map(
        (item) => `
        <div class="history-item" data-id="${item.movieId}">
          <div>
            <strong>${escapeHtml(item.movieTitle)}</strong>
            <small>${new Date(item.watchedAt).toLocaleString()}</small>
          </div>
          <button class="btn btn-secondary" data-remove="${item.movieId}">Remove</button>
        </div>
      `
      )
      .join("");

    historyList.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", async () => {
        const movieId = Number(button.dataset.remove);
        try {
          await removeWatchHistory(movieId);
          button.closest(".history-item")?.remove();
          showToast("History item removed", "success");
        } catch (error) {
          showToast(error.message, "error");
        }
      });
    });
  } catch (error) {
    historyList.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
};

const setupUserMenu = () => {
  userToggle.addEventListener("click", () => {
    const open = userDropdown.classList.toggle("hidden") === false;
    userToggle.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#userMenu")) {
      userDropdown.classList.add("hidden");
      userToggle.setAttribute("aria-expanded", "false");
    }
  });

  profileBtn.addEventListener("click", () => {
    const user = state.user;
    showToast(`Logged in as ${user.username} (${user.email})`, "info", 4500);
  });

  historyBtn.addEventListener("click", async () => {
    historyModal.classList.remove("hidden");
    await loadHistory();
  });

  logoutBtn.addEventListener("click", () => {
    clearToken();
    window.location.href = "/index.html";
  });
};

const setupEvents = () => {
  tabsNav.addEventListener("click", (event) => {
    const target = event.target.closest(".tab-btn");
    if (!target) return;
    activateTab(target.dataset.tab);
  });

  searchInput.addEventListener("input", () => {
    runSearch(searchInput.value);
  });

  friendForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const identifier = friendIdentifier.value.trim();
    if (!identifier) {
      showToast("Enter a username or email", "info");
      return;
    }

    try {
      const response = await addFriend(identifier);
      state.friends = [response.friend, ...state.friends];
      state.friends = state.friends.filter(
        (friend, index, list) => list.findIndex((item) => item._id === friend._id) === index
      );
      friendIdentifier.value = "";
      renderFriendList();
      await loadFriendRecommendations();
      showToast("Friend added", "success");
    } catch (error) {
      showToast(error.message || "Failed to add friend", "error");
    }
  });

  runtimeSlider.addEventListener("input", debouncedQuickWatch);

  closeTrailerModalBtn.addEventListener("click", closeTrailerModal);
  trailerModal.addEventListener("click", (event) => {
    if (event.target === trailerModal) closeTrailerModal();
  });

  savePreferencesBtn.addEventListener("click", saveOnboardingPreferences);
  dismissPreferencesBtn.addEventListener("click", () => onboardingModal.classList.add("hidden"));
  skipOnboardingBtn.addEventListener("click", () => onboardingModal.classList.add("hidden"));

  closeHistoryModal.addEventListener("click", () => historyModal.classList.add("hidden"));
  historyModal.addEventListener("click", (event) => {
    if (event.target === historyModal) historyModal.classList.add("hidden");
  });

  setupTopRatedFilters();
  setupUserMenu();
};

const renderInitialSkeletons = () => {
  moodGrid.innerHTML = createCardSkeletons(8);
  friendGrid.innerHTML = createCardSkeletons(6);
  topRatedGrid.innerHTML = createCardSkeletons(8);
  quickWatchGrid.innerHTML = createCardSkeletons(8);
  trendingGrid.innerHTML = createCardSkeletons(8);
};

const hydrateUser = async () => {
  const data = await getCurrentUser();
  state.user = data.user;

  userNameEl.textContent = state.user.username;
  userAvatar.textContent = (state.user.username || "U").charAt(0).toUpperCase();
};

const loadDashboardData = async () => {
  const [genreData, trendingData, topRatedData, popularData, friendData] = await Promise.all([
    getMovieGenres(),
    getTrendingMovies(),
    getTopRatedMovies(),
    getPopularMovies(),
    getFriends(),
  ]);

  state.genres = genreData.genres || [];
  state.genreMap = new Map(state.genres.map((genre) => [genre.id, genre.name]));
  state.trending = deduplicateMovies(trendingData.results || []);
  state.topRated = sortByRating(topRatedData.results || []);
  state.popular = deduplicateMovies(popularData.results || []);
  state.friends = friendData.friends || [];

  renderHero(state.trending[0] || state.topRated[0] || state.popular[0]);
  renderMovieCards(trendingGrid, getTopN(state.trending, 24), { showRank: true });
  renderFriendList();
  applyTopRatedFilter("all");

  runtimeValue.textContent = `Max Runtime: ${runtimeSlider.value} min`;
  await loadQuickWatch(Number(runtimeSlider.value));

  state.currentMood = state.user?.preferences?.mood || state.currentMood;
  renderMoodButtons();
  await loadMoodRecommendations(state.currentMood);
  await loadFriendRecommendations();
  maybeShowOnboarding();
};

const init = async () => {
  renderInitialSkeletons();
  setupEvents();

  try {
    await hydrateUser();
    await loadDashboardData();
  } catch (error) {
    showToast(error.message || "Session expired. Please log in again.", "error");
    clearToken();
    window.setTimeout(() => {
      window.location.href = "/index.html";
    }, 600);
  }
};

init();
