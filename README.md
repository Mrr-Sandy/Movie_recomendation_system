# CineMatch - Smart Movie Recommendation System

CineMatch is a full-stack movie recommendation platform built with Node.js, Express, MongoDB Atlas, and Vanilla JavaScript.

## Features

- JWT authentication (register/login/me)
- RapidAPI (Netflix54) powered content integration
- Mood-based recommendations
- Top-rated filters and quick-watch runtime filter
- Movie details page with trailers, cast, and similar movies
- User preferences, favorites, and watch history
- Responsive Netflix-inspired dark UI with vanilla HTML/CSS/JS

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
3. Add your MongoDB Atlas connection string in `.env`.
4. Add your RapidAPI key in `.env` for `netflix54.p.rapidapi.com`.
5. Run the development server:
   ```bash
   npm run dev
   ```
6. Open:
   http://localhost:5000

## Environment Variables

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/cinematch
JWT_SECRET=your_jwt_secret_key_here
RAPIDAPI_KEY=your_rapidapi_key_here
RAPIDAPI_HOST=netflix54.p.rapidapi.com
RAPIDAPI_BASE_URL=https://netflix54.p.rapidapi.com
NETFLIX_DEFAULT_IDS=80077209,80117715
CLIENT_URL=http://localhost:5000
DOMAIN_URL=https://yourdomain.com
NODE_ENV=development
DB_CONNECT_TIMEOUT_MS=10000
```
