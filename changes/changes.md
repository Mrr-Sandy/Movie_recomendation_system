# Movie Recommendation System Changes

- Note: yeh summary current codebase snapshot ke basis par banayi gayi hai, kyunki is folder mein `.git` repository metadata available nahi mila.

## Backend / Server

- `server.js`
- Express server setup kiya gaya hai with `dotenv`, `helmet`, `cors`, `express-rate-limit`, JSON/urlencoded parsing, static file serving, aur MongoDB connection flow.
- Startup par environment validation add hai for `MONGODB_URI`, `JWT_SECRET`, aur `RAPIDAPI_KEY`, taaki placeholder config ke saath server accidentally run na ho.
- Allowed origins list aur strict CORS callback logic implement hai.
- Security headers ke liye custom Content Security Policy configure ki gayi hai.
- `/api/auth` par auth rate limiter apply kiya gaya hai.
- Root, dashboard, aur movie detail pages ke liye static HTML routes serve ho rahe hain.
- 404 handler aur centralized error handler add kiya gaya hai.

## Authentication

- `routes/auth.js`
- User registration flow add hai with username/email/password validation.
- Input sanitization aur email normalization apply kiya gaya hai.
- Duplicate email aur duplicate username checks add hain.
- Password hashing `bcryptjs` se ho raha hai.
- JWT token generation with 7 day expiry implement hai.
- Login endpoint mein email validation, password verification, aur token response add hai.
- Protected `/me` endpoint se current logged-in user data return hota hai.

- `middleware/auth.js`
- Bearer token aur fallback `x-auth-token` based auth middleware implement hai.
- Invalid ya expired JWT ke liye proper `401` response diya ja raha hai.

## Database Models

- `models/User.js`
- User schema mein `username`, `email`, `password`, aur `preferences` structure add hai.
- Preferences ke andar `genres`, `mood`, aur `favoriteMovies` fields maintained hain.
- Email format validation schema level par add hai.
- `toJSON` transform ke through password aur `__v` response se remove kiya ja raha hai.

- `models/WatchHistory.js`
- Watch history ke liye dedicated schema add hai with `userId`, `movieId`, `movieTitle`, `watchedAt`, aur `rating`.
- `userId + movieId` composite unique index add hai, jisse same movie ka duplicate history record avoid hota hai.

## Movie APIs / Recommendation Logic

- `routes/movies.js`
- RapidAPI Netflix54 integration ke liye request layer build ki gayi hai.
- Environment-based API host/base URL/default IDs support add hai.
- In-memory cache aur in-flight request deduplication implement hai for repeated movie fetches.
- Raw season episode data ko normalized movie-like objects mein convert karne ka layer add hai.
- Genre inference keyword rules ke basis par derive ki ja rahi hai.
- Derived fields jaise runtime, vote average, vote count, release date, poster/backdrop mapping generate kiye ja rahe hain.
- `trending`, `popular`, `top-rated`, `genres`, `search`, `recommend`, `season-episodes`, aur movie detail endpoints implement hain.
- `trending` feature direct normalized episode list ko sorted season/episode order mein return karta hai, isliye latest fetched content sequence-wise show hota hai.
- `popular` feature popularity score aur runtime ke descending sort ke basis par content rank karta hai.
- `top-rated` feature runtime descending sort use karta hai, jisse longer/high-value titles top par aate hain; frontend is data ko rating sort ke saath aur refine karta hai.
- `search` feature title + overview text ke andar lowercase keyword match karta hai.
- `recommend` feature mood, genre, aur runtime inputs ke basis par multi-step filtering aur scoring apply karta hai.
- Mood-based recommendation ke liye har mood ka keyword map banaya gaya hai, jaise `happy`, `romantic`, `thriller`, `horror`, `sci-fi`, etc.
- Genre-based recommendation ke liye requested genre IDs aur movie `genre_ids` ke beech overlap nikala jaata hai.
- Runtime-based recommendation ke liye `maxRuntime` ke against movie runtime compare kiya jaata hai.
- Final recommendation score formula mein mood score ko highest weight, phir genre score, phir runtime fit, vote average, aur popularity ko combine kiya gaya hai.
- Similar content generation current item ke season aur genre overlap ke basis par ho raha hai.
- Trailer endpoint graceful fallback deta hai jab RapidAPI source trailer data provide nahi karta.

## User Features APIs

- `routes/user.js`
- Auth-protected preferences save endpoint add hai.
- Genre IDs normalization aur mood sanitization implement hai.
- Watch history fetch, add/update, aur delete endpoints available hain.
- History add karte waqt rating validation aur upsert behavior add hai.
- Favorite movie toggle endpoint add hai jo user preferences ke andar list maintain karta hai.

## Frontend API Layer

- `public/js/api.js`
- Centralized `apiRequest` wrapper add hai with JSON headers, auth token injection, error parsing, aur 401 redirect handling.
- Auth, movies, recommendations, preferences, history, aur favorite operations ke liye dedicated helper methods add hain.
- Local storage based token management (`getToken`, `setToken`, `clearToken`) implement hai.

## Frontend Auth Flow

- `public/js/auth.js`
- Login/signup page ke liye client-side validation add hai.
- Email validation, password length checks, confirm password match, aur realtime field errors implement kiye gaye hain.
- Signup form par password strength indicator add hai.
- Password show/hide toggles implement hain.
- Successful login/signup ke baad token store karke dashboard redirect flow add hai.
- Existing logged-in user ke liye auto-redirect to dashboard implement hai.

## Frontend Dashboard

- `public/js/dashboard.js`
- Dashboard state management for user, genres, trending, top-rated, popular, search results, aur selected mood implement hai.
- Hero section dynamic featured movie ke saath render hota hai.
- Mood-based recommendation buttons user ke selected mood ko state mein save karte hain aur `/movies/recommend` endpoint se fresh results load karte hain.
- Mood change ke baad selected mood user preferences mein backend par bhi save hota hai.
- Quick watch/runtime feature slider value ko `maxRuntime` ke roop mein recommendation API ko bhejta hai.
- Runtime slider debounce ke saath wired hai, taaki har small movement par unnecessary API spam na ho.
- Quick watch section matching movie count bhi dikhata hai.
- Top-rated section ke liye filters add hain (`year`, `awards`, `all-time`).
- `year` filter current year ke release date ke hisaab se movies filter karta hai.
- `awards` filter high vote average aur minimum vote count wale titles select karta hai.
- `all-time` filter utility merge sort ke through rating descending order use karta hai.
- Trending section API se aaye titles ko rank badge ke saath render karta hai.
- Search feature remote API + local trie-based search merge karke results dikhata hai.
- Local search ke liye trending, top-rated, aur popular data ko combine karke trie-like prefix matching chalayi jaati hai.
- Onboarding modal se initial genre preferences collect ki ja rahi hain.
- User dropdown, profile info toast, logout flow, aur watch history modal implement hain.
- Trailer modal aur history sync behavior dashboard level par wired hai.

## Frontend Movie Detail Page

- `public/js/movie.js`
- Query string se movie ID read karke detail page load hota hai.
- Detailed hero banner, metadata section, cast section, aur similar movies section render ho rahe hain.
- Favorites toggle backend se sync hota hai.
- Watchlist localStorage based client-side feature ke roop mein add hai.
- Trailer modal support aur watch history write-back implement hai.
- Similar movies section backend se aaye `similar.results` ko clickable cards ke form mein render karta hai.
- Primary trailer unavailable hone par fallback trailer API hit hoti hai.
- Invalid movie ID aur auth/session failure ke liye fallback redirects add hain.

## Frontend Utility Layer

- `public/js/utils.js`
- Image URL helpers absolute URLs aur TMDB-style paths dono handle karte hain.
- HTML escaping, date/runtime/currency formatting, toast notifications, skeleton generation, aur button loading helpers add hain.
- Multiple algorithmic helpers include kiye gaye hain:
- Merge sort based rating sort
- Duration filter
- Trie-like prefix search
- Jaccard similarity score
- Movie deduplication
- Top-N selection
- Genre grouping
- Debounce helper

## Pages / UI Structure

- `public/index.html`, `public/dashboard.html`, `public/movie.html`
- Authentication, dashboard, aur movie detail ke liye separate frontend pages structured hain.

- `public/css/auth.css`, `public/css/dashboard.css`, `public/css/main.css`
- UI styling ke liye dedicated CSS modules present hain, jo auth page, dashboard page, aur shared look-and-feel ko handle karte hain.

## Config / Docs

- `package.json`
- Project scripts `start` aur `dev` ke saath backend stack dependencies configured hain.
- Security, auth, database, aur external API related packages included hain.

- `.env.example`
- Required environment variables ka template maintain kiya gaya hai.

- `README.md`
- Setup steps, feature overview, environment variable documentation, aur local run instructions documented hain.
