export const IMAGE_BASE = "https://image.tmdb.org/t/p";

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const isAbsoluteUrl = (value) => /^https?:\/\//i.test(String(value || ""));
const isMissingImage = (value) => {
  const text = String(value || "").trim();
  return !text || /^n\/a$/i.test(text);
};

export const escapeHtml = (text) =>
  String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

export const getPosterUrl = (posterPath, size = "w500") => {
  if (isMissingImage(posterPath)) return "";
  if (isAbsoluteUrl(posterPath)) return String(posterPath);
  return `${IMAGE_BASE}/${size}${posterPath}`;
};

export const getBackdropUrl = (backdropPath, size = "w1280") => {
  if (isMissingImage(backdropPath)) return "";
  if (isAbsoluteUrl(backdropPath)) return String(backdropPath);
  return `${IMAGE_BASE}/${size}${backdropPath}`;
};

export const getProfileUrl = (profilePath, size = "w185") => {
  if (isMissingImage(profilePath)) return "";
  if (isAbsoluteUrl(profilePath)) return String(profilePath);
  return `${IMAGE_BASE}/${size}${profilePath}`;
};

export const getYear = (dateValue) => {
  if (!dateValue) return "N/A";
  const parsedDate = new Date(dateValue);
  return Number.isNaN(parsedDate.getTime()) ? "N/A" : String(parsedDate.getFullYear());
};

export const formatRuntime = (minutes) => {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "N/A";
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours}h ${mins}m`;
};

export const formatDate = (dateValue) => {
  if (!dateValue) return "N/A";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "N/A";
  return parsedDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
};

export const toStarRating = (voteAverage) => {
  const stars = Number(voteAverage) / 2;
  if (!Number.isFinite(stars)) return 0;
  return Math.max(0, Math.min(5, Number(stars.toFixed(1))));
};

export const renderGenrePill = (genreId, genreName) => {
  const safeName = escapeHtml(genreName || "Genre");
  const className = Number.isFinite(Number(genreId)) ? `genre-${Number(genreId)}` : "genre-default";
  return `<span class="genre-pill ${className}">${safeName}</span>`;
};

export const createCardSkeletons = (count = 8) => {
  const quantity = Math.max(1, Number(count) || 1);
  return Array.from({ length: quantity })
    .map(
      () => `
      <article class="movie-card">
        <div class="movie-thumb-wrap skeleton"></div>
        <div class="movie-content">
          <div class="skeleton" style="height: 20px; border-radius: 8px;"></div>
          <div class="skeleton" style="height: 16px; border-radius: 8px; margin-top: 10px;"></div>
        </div>
      </article>
    `
    )
    .join("");
};

export const setButtonLoading = (buttonEl, isLoading, loadingText = "Loading...") => {
  if (!buttonEl) return;
  const textEl = buttonEl.querySelector(".btn-text");
  const originalText = buttonEl.dataset.originalText || (textEl ? textEl.textContent : buttonEl.textContent);
  buttonEl.dataset.originalText = originalText;

  if (isLoading) {
    buttonEl.classList.add("is-loading");
    if (textEl) {
      textEl.textContent = loadingText;
    } else {
      buttonEl.textContent = loadingText;
    }
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.dataset.spinner = "true";
    buttonEl.appendChild(spinner);
  } else {
    buttonEl.classList.remove("is-loading");
    if (textEl) {
      textEl.textContent = originalText;
    } else {
      buttonEl.textContent = originalText;
    }
    const spinner = buttonEl.querySelector("[data-spinner='true']");
    if (spinner) spinner.remove();
  }
};

export const showToast = (message, type = "info", timeout = 3200) => {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    window.setTimeout(() => toast.remove(), 250);
  }, timeout);
};

/**
 * Algorithm: Merge Sort (descending by vote_average).
 * Time Complexity: O(n log n)
 * Space Complexity: O(n)
 */
export function sortByRating(movies) {
  const list = Array.isArray(movies) ? movies.slice() : [];
  if (list.length <= 1) return list;

  const merge = (left, right) => {
    const merged = [];
    let i = 0;
    let j = 0;

    while (i < left.length && j < right.length) {
      const leftScore = Number(left[i].vote_average) || 0;
      const rightScore = Number(right[j].vote_average) || 0;
      if (leftScore >= rightScore) {
        merged.push(left[i]);
        i += 1;
      } else {
        merged.push(right[j]);
        j += 1;
      }
    }

    return merged.concat(left.slice(i), right.slice(j));
  };

  const mergeSort = (arr) => {
    if (arr.length <= 1) return arr;
    const mid = Math.floor(arr.length / 2);
    const left = mergeSort(arr.slice(0, mid));
    const right = mergeSort(arr.slice(mid));
    return merge(left, right);
  };

  return mergeSort(list);
}

/**
 * Algorithm: Linear Scan Filter.
 * Time Complexity: O(n)
 * Space Complexity: O(k) where k is the number of matched movies.
 */
export function filterByDuration(movies, maxMinutes) {
  const max = Number(maxMinutes);
  if (!Array.isArray(movies) || !Number.isFinite(max)) return [];

  const output = [];
  for (const movie of movies) {
    const runtime = Number(movie.runtime);
    if (Number.isFinite(runtime) && runtime <= max) {
      output.push(movie);
    }
  }
  return output;
}

/**
 * Algorithm: Trie-like Prefix Matching over movie titles.
 * Time Complexity: O(T + q + r) where T is total title chars, q is query length, r is matched titles.
 * Space Complexity: O(T) for trie nodes.
 */
export function searchMovies(movies, query) {
  const list = Array.isArray(movies) ? movies : [];
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return list.slice();

  const createNode = () => ({ children: Object.create(null), movies: [] });
  const root = createNode();

  const insertWord = (word, movie) => {
    let node = root;
    for (const ch of word) {
      if (!node.children[ch]) {
        node.children[ch] = createNode();
      }
      node = node.children[ch];
      node.movies.push(movie);
    }
  };

  for (const movie of list) {
    const title = normalizeText(movie.title || movie.name || "");
    if (!title) continue;
    insertWord(title, movie);
    for (const token of title.split(/\s+/).filter(Boolean)) {
      insertWord(token, movie);
    }
  }

  let node = root;
  for (const ch of normalizedQuery) {
    node = node.children[ch];
    if (!node) return [];
  }

  const seen = Object.create(null);
  const output = [];
  for (const movie of node.movies) {
    const key = movie.id || `${movie.title}-${movie.release_date}`;
    if (!seen[key]) {
      seen[key] = true;
      output.push(movie);
    }
  }

  return output;
}

/**
 * Algorithm: Jaccard Similarity (set intersection / set union).
 * Time Complexity: O(g + l) where g is movie genres length, l is liked genres length.
 * Space Complexity: O(g + l)
 */
export function getSimilarityScore(movie, likedGenreIds) {
  const liked = new Set((likedGenreIds || []).map(Number).filter(Number.isFinite));

  const movieGenresRaw = Array.isArray(movie?.genre_ids)
    ? movie.genre_ids
    : Array.isArray(movie?.genres)
      ? movie.genres.map((genre) => genre.id)
      : [];

  const movieGenres = new Set(movieGenresRaw.map(Number).filter(Number.isFinite));

  if (movieGenres.size === 0 && liked.size === 0) return 0;

  let intersection = 0;
  for (const id of movieGenres) {
    if (liked.has(id)) intersection += 1;
  }

  const union = new Set([...movieGenres, ...liked]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Algorithm: HashMap-based De-duplication keyed by movie id.
 * Time Complexity: O(n)
 * Space Complexity: O(n)
 */
export function deduplicateMovies(movies) {
  const list = Array.isArray(movies) ? movies : [];
  const byId = Object.create(null);

  for (const movie of list) {
    const key = movie?.id;
    if (!Number.isFinite(Number(key))) continue;
    byId[key] = movie;
  }

  return Object.values(byId);
}

/**
 * Algorithm: Partial Selection (maintains sorted top-N buffer).
 * Time Complexity: O(n * nTop) where nTop is N (good for small N)
 * Space Complexity: O(nTop + u) where u is unique seen ids.
 */
export function getTopN(movies, n) {
  const list = Array.isArray(movies) ? movies : [];
  const limit = Math.max(0, Number(n) || 0);
  if (limit === 0) return [];

  const top = [];
  const seenIds = new Set();

  const insertSorted = (movie) => {
    const score = Number(movie.vote_average) || 0;
    let index = top.length;
    while (index > 0 && (Number(top[index - 1].vote_average) || 0) < score) {
      index -= 1;
    }
    top.splice(index, 0, movie);
    if (top.length > limit) {
      top.pop();
    }
  };

  for (const movie of list) {
    const movieId = Number(movie?.id);
    if (Number.isFinite(movieId)) {
      if (seenIds.has(movieId)) continue;
      seenIds.add(movieId);
    }

    if (top.length < limit) {
      insertSorted(movie);
      continue;
    }

    const tailScore = Number(top[top.length - 1]?.vote_average) || 0;
    const currentScore = Number(movie.vote_average) || 0;
    if (currentScore > tailScore) {
      insertSorted(movie);
    }
  }

  return top;
}

/**
 * Algorithm: HashMap Grouping by genre id.
 * Time Complexity: O(n * g) where g is average genre count per movie.
 * Space Complexity: O(n + uniqueGenres)
 */
export function groupByGenre(movies) {
  const list = Array.isArray(movies) ? movies : [];
  const grouped = Object.create(null);

  for (const movie of list) {
    const genreIds = Array.isArray(movie.genre_ids)
      ? movie.genre_ids
      : Array.isArray(movie.genres)
        ? movie.genres.map((genre) => genre.id)
        : [];

    for (const genreId of genreIds) {
      const id = Number(genreId);
      if (!Number.isFinite(id)) continue;
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(movie);
    }
  }

  return grouped;
}

/**
 * Algorithm: Debounce using closure + timer reset.
 * Time Complexity: O(1) per invocation (amortized)
 * Space Complexity: O(1)
 */
export function debounce(fn, delay) {
  let timerId;

  return function debounced(...args) {
    const context = this;
    clearTimeout(timerId);
    timerId = window.setTimeout(() => {
      fn.apply(context, args);
    }, delay);
  };
}
