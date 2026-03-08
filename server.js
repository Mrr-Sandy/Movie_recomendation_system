const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000;

const isMissingOrPlaceholder = (value) => {
  const text = String(value || "").trim();
  if (!text) return true;
  return /<user>|<pass>|your_.*_here/i.test(text);
};

if (isMissingOrPlaceholder(MONGODB_URI)) {
  throw new Error(
    "MONGODB_URI is missing or still a placeholder in .env. Add your real MongoDB Atlas URI."
  );
}

if (isMissingOrPlaceholder(process.env.JWT_SECRET)) {
  throw new Error(
    "JWT_SECRET is missing or still a placeholder in .env. Set a strong secret value."
  );
}

if (isMissingOrPlaceholder(process.env.RAPIDAPI_KEY || process.env.X_RAPIDAPI_KEY)) {
  throw new Error(
    "RAPIDAPI_KEY is missing or still a placeholder in .env. Add your RapidAPI key."
  );
}

const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  process.env.CLIENT_URL,
  process.env.DOMAIN_URL,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "connect-src": ["'self'", "https://netflix54.p.rapidapi.com"],
        "frame-src": ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
        "script-src-attr": ["'unsafe-inline'"],
      },
    },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again later." },
});

app.use("/api/auth", authLimiter);
app.use("/api/auth", require("./routes/auth"));
app.use("/api/movies", require("./routes/movies"));
app.use("/api/user", require("./routes/user"));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/dashboard.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/movie.html", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "movie.html"));
});

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  if (process.env.NODE_ENV !== "production") {
    console.error(err);
  }

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "CORS policy blocked this request." });
  }

  return res.status(500).json({ message: "Internal server error" });
});

mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: DB_CONNECT_TIMEOUT_MS,
    socketTimeoutMS: DB_CONNECT_TIMEOUT_MS,
    maxPoolSize: 10,
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`CineMatch server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(
      `MongoDB connection failed after ${DB_CONNECT_TIMEOUT_MS}ms:`,
      error.message
    );
    process.exit(1);
  });
