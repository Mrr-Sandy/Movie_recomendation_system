const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.headers["x-auth-token"];

  if (!token) {
    return res.status(401).json({ message: "Authorization token missing" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    return next();
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("JWT verification error:", error.message);
    }
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
