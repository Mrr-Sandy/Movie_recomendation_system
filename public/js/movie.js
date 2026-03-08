import {
  addWatchHistory,
  clearToken,
  getCurrentUser,
  getMovieDetails,
  getMovieTrailer,
  toggleFavoriteMovie,
} from "./api.js";
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatRuntime,
  getBackdropUrl,
  getPosterUrl,
  getProfileUrl,
  getYear,
  renderGenrePill,
  showToast,
  toStarRating,
} from "./utils.js";

const movieHero = document.getElementById("movieHero");
const backButton = document.getElementById("backToDashboard");
const trailerFrame = document.getElementById("primaryTrailerFrame");
const noTrailerMessage = document.getElementById("noTrailerMessage");
const trailerList = document.getElementById("trailerList");
const movieInfoGrid = document.getElementById("movieInfoGrid");
const castRow = document.getElementById("castRow");
const similarRow = document.getElementById("similarRow");

const modal = document.getElementById("trailerModal");
const modalFrame = document.getElementById("modalTrailerFrame");
const modalTitle = document.getElementById("modalTrailerTitle");
const closeModalButton = document.getElementById("closeTrailerModal");

const watchlistKey = "cm_watchlist";

const state = {
  user: null,
  movie: null,
  trailers: [],
  isFavorite: false,
};

const getMovieId = () => {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get("id"));
};

const getWatchlist = () => {
  try {
    const raw = localStorage.getItem(watchlistKey);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch (_error) {
    return new Set();
  }
};

const saveWatchlist = (watchlistSet) => {
  localStorage.setItem(watchlistKey, JSON.stringify([...watchlistSet]));
};

const closeModal = () => {
  modal.classList.add("hidden");
  modalFrame.src = "";
};

const openTrailerModal = (key, title) => {
  if (!key) {
    showToast("Trailer unavailable", "error");
    return;
  }

  modalTitle.textContent = title || "Trailer";
  modalFrame.src = `https://www.youtube.com/embed/${key}?autoplay=1`;
  modal.classList.remove("hidden");
};

const renderHero = () => {
  const movie = state.movie;
  const backdrop = getBackdropUrl(movie.backdrop_path, "w1280");
  const genresHtml = (movie.genres || [])
    .map((genre) => renderGenrePill(genre.id, genre.name))
    .join("");

  const favoriteText = state.isFavorite
    ? "&#10084; Remove Favorite"
    : "&#10084; Add to Favorites";

  movieHero.classList.remove("skeleton");
  movieHero.style.backgroundImage = backdrop ? `url('${backdrop}')` : "none";
  movieHero.innerHTML = `
    <div class="hero-content slide-up">
      <h1>${escapeHtml(movie.title || "Untitled")}</h1>
      <p class="movie-tagline">${escapeHtml(movie.tagline || "")}</p>
      <div class="hero-meta">
        <span>${getYear(movie.release_date)}</span>
        <span>${formatRuntime(movie.runtime)}</span>
        <span class="star-rating" style="--rating:${toStarRating(movie.vote_average)}"></span>
        <span>${movie.adult ? "18+" : "PG"}</span>
      </div>
      <div class="genre-row">${genresHtml}</div>
      <p class="hero-description">${escapeHtml(movie.overview || "No overview available")}</p>
      <div class="hero-actions">
        <button class="btn btn-primary" id="watchTrailerBtn">&#9654; Watch Trailer</button>
        <button class="btn btn-secondary" id="favoriteBtn">${favoriteText}</button>
        <button class="btn btn-outline add-watchlist" id="watchlistBtn">+ Add to Watchlist</button>
      </div>
    </div>
  `;

  const watchTrailerBtn = document.getElementById("watchTrailerBtn");
  const favoriteBtn = document.getElementById("favoriteBtn");
  const watchlistBtn = document.getElementById("watchlistBtn");

  const watchlistSet = getWatchlist();
  const inWatchlist = watchlistSet.has(movie.id);
  watchlistBtn.classList.toggle("active", inWatchlist);
  watchlistBtn.innerHTML = inWatchlist ? "&#10003; In Watchlist" : "+ Add to Watchlist";

  watchTrailerBtn?.addEventListener("click", async () => {
    const primaryTrailer = state.trailers[0];

    if (primaryTrailer) {
      openTrailerModal(primaryTrailer.key, primaryTrailer.name);
    } else {
      try {
        const trailer = await getMovieTrailer(movie.id);
        if (!trailer?.key) {
          showToast(trailer?.message || "Trailer unavailable for this title", "info");
        } else {
          openTrailerModal(trailer.key, trailer.name);
        }
      } catch (error) {
        showToast(error.message, "error");
      }
    }

    try {
      await addWatchHistory({ movieId: movie.id, movieTitle: movie.title });
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  favoriteBtn?.addEventListener("click", async () => {
    try {
      const response = await toggleFavoriteMovie(movie.id);
      state.isFavorite = response.isFavorite;
      favoriteBtn.innerHTML = state.isFavorite
        ? "&#10084; Remove Favorite"
        : "&#10084; Add to Favorites";
      showToast(response.message, "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  watchlistBtn?.addEventListener("click", () => {
    const currentSet = getWatchlist();

    if (currentSet.has(movie.id)) {
      currentSet.delete(movie.id);
      showToast("Removed from watchlist", "info");
    } else {
      currentSet.add(movie.id);
      showToast("Added to watchlist", "success");
    }

    saveWatchlist(currentSet);
    const existsNow = currentSet.has(movie.id);
    watchlistBtn.classList.toggle("active", existsNow);
    watchlistBtn.innerHTML = existsNow ? "&#10003; In Watchlist" : "+ Add to Watchlist";
  });
};

const renderTrailerSection = () => {
  const youtubeTrailers = (state.movie.videos?.results || []).filter(
    (video) => video.type === "Trailer" && video.site === "YouTube"
  );
  state.trailers = youtubeTrailers;

  if (!youtubeTrailers.length) {
    trailerFrame.classList.add("hidden");
    noTrailerMessage.classList.remove("hidden");
    trailerList.innerHTML = "";
    return;
  }

  const [firstTrailer] = youtubeTrailers;
  trailerFrame.classList.remove("hidden");
  noTrailerMessage.classList.add("hidden");
  trailerFrame.src = `https://www.youtube.com/embed/${firstTrailer.key}?rel=0&showinfo=0`;

  trailerList.innerHTML = youtubeTrailers
    .map(
      (trailer) => `
      <button class="trailer-thumb" data-key="${trailer.key}" data-name="${escapeHtml(trailer.name || "Trailer")}">
        <img src="https://img.youtube.com/vi/${trailer.key}/mqdefault.jpg" alt="${escapeHtml(trailer.name || "Trailer thumbnail")}" onerror="this.style.display='none'" />
        <span>${escapeHtml(trailer.name || "Trailer")}</span>
      </button>
    `
    )
    .join("");

  trailerList.querySelectorAll(".trailer-thumb").forEach((button) => {
    button.addEventListener("click", () => {
      trailerFrame.src = `https://www.youtube.com/embed/${button.dataset.key}?rel=0&showinfo=0`;
    });
  });
};

const renderInfoGrid = () => {
  const movie = state.movie;
  const items = [
    { label: "Original Title", value: movie.original_title || "N/A" },
    { label: "Release Date", value: formatDate(movie.release_date) },
    { label: "Budget", value: formatCurrency(movie.budget) },
    { label: "Revenue", value: formatCurrency(movie.revenue) },
    {
      label: "Production Companies",
      value: movie.production_companies?.length
        ? movie.production_companies.map((company) => company.name).join(", ")
        : "N/A",
    },
    {
      label: "Languages",
      value: movie.spoken_languages?.length
        ? movie.spoken_languages.map((language) => language.english_name).join(", ")
        : "N/A",
    },
  ];

  movieInfoGrid.innerHTML = items
    .map(
      (item) => `
      <article class="info-cell">
        <div class="info-label">${escapeHtml(item.label)}</div>
        <div>${escapeHtml(item.value)}</div>
      </article>
    `
    )
    .join("");
};

const renderCast = () => {
  const cast = (state.movie.credits?.cast || []).slice(0, 18);

  if (!cast.length) {
    castRow.innerHTML = `<div class="empty-state">Cast data unavailable</div>`;
    return;
  }

  castRow.innerHTML = cast
    .map((member) => {
      const image = getProfileUrl(member.profile_path, "w185");
      return `
        <article class="cast-card">
          ${
            image
              ? `<img class="cast-image" src="${image}" alt="${escapeHtml(member.name)}" onerror="this.outerHTML='<div class=\\'poster-fallback\\'>&#127917;</div>'"/>`
              : `<div class="poster-fallback">&#127917;</div>`
          }
          <div class="cast-content">
            <div class="cast-name">${escapeHtml(member.name)}</div>
            <div class="cast-character">${escapeHtml(member.character || "")}</div>
          </div>
        </article>
      `;
    })
    .join("");
};

const renderSimilarMovies = () => {
  const similarMovies = state.movie.similar?.results || [];

  if (!similarMovies.length) {
    similarRow.innerHTML = `<div class="empty-state">No similar movies found</div>`;
    return;
  }

  similarRow.innerHTML = similarMovies
    .slice(0, 20)
    .map((movie) => {
      const posterPath = getPosterUrl(movie.poster_path, "w342");

      return `
        <article class="movie-card" data-id="${movie.id}">
          <div class="movie-thumb-wrap">
            ${
              posterPath
                ? `<img class="movie-thumb" src="${posterPath}" alt="${escapeHtml(movie.title || "Movie")}" onerror="this.outerHTML='<div class=\\'poster-fallback\\'>&#127916;</div>'"/>`
                : `<div class="poster-fallback">&#127916;</div>`
            }
          </div>
          <div class="movie-content">
            <h3 class="movie-title">${escapeHtml(movie.title || "Untitled")}</h3>
            <div class="movie-meta">
              <span>${getYear(movie.release_date)}</span>
              <span>N/A</span>
              <span class="star-rating" style="--rating:${toStarRating(movie.vote_average)}"></span>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  similarRow.querySelectorAll(".movie-card").forEach((card) => {
    card.addEventListener("click", () => {
      const similarId = Number(card.dataset.id);
      if (Number.isFinite(similarId)) {
        window.location.href = `/movie.html?id=${similarId}`;
      }
    });
  });
};

const hydrateUser = async () => {
  const userData = await getCurrentUser();
  state.user = userData.user;
};

const loadMovie = async () => {
  const movieId = getMovieId();

  if (!Number.isInteger(movieId) || movieId <= 0) {
    showToast("Invalid movie id.", "error");
    window.location.href = "/dashboard.html";
    return;
  }

  const movieData = await getMovieDetails(movieId);
  state.movie = movieData;
  state.isFavorite = (state.user?.preferences?.favoriteMovies || []).includes(movieId);

  renderHero();
  renderTrailerSection();
  renderInfoGrid();
  renderCast();
  renderSimilarMovies();
};

const setupEvents = () => {
  backButton.addEventListener("click", () => {
    window.location.href = "/dashboard.html";
  });

  closeModalButton.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
};

const init = async () => {
  setupEvents();

  try {
    await hydrateUser();
    await loadMovie();
  } catch (error) {
    showToast(error.message || "Unable to load movie", "error");
    clearToken();
    window.setTimeout(() => {
      window.location.href = "/index.html";
    }, 700);
  }
};

init();
