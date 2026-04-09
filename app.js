const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const { connectToDatabase } = require("./lib/database");

dotenv.config();

const app = express();
const isVercel = Boolean(process.env.VERCEL);

const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  process.env.CLIENT_URL,
  process.env.DOMAIN_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(".vercel.app");
  } catch (_error) {
    return false;
  }
};

const requireDatabase = async (_req, _res, next) => {
  try {
    await connectToDatabase();
    return next();
  } catch (error) {
    return next(error);
  }
};

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
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

app.use("/api/auth", authLimiter, requireDatabase, require("./routes/auth"));
app.use("/api/movies", require("./routes/movies"));
app.use("/api/user", requireDatabase, require("./routes/user"));

if (!isVercel) {
  app.use(express.static(path.join(__dirname, "public")));
}

app.get("/", (_req, res) => {
  if (isVercel) {
    return res.redirect("/index.html");
  }

  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (!isVercel) {
  app.get("/dashboard.html", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
  });

  app.get("/movie.html", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "movie.html"));
  });
}

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

  if (err.code === "CONFIG_ERROR") {
    return res.status(err.statusCode || 500).json({ message: err.message });
  }

  if (err.name?.startsWith("Mongo")) {
    return res.status(500).json({ message: "Database connection failed" });
  }

  return res.status(500).json({ message: "Internal server error" });
});

module.exports = {
  app,
  connectToDatabase,
};
