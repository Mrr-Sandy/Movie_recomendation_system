module.exports = (_req, res) => {
  res.statusCode = 302;
  res.setHeader("Location", "/index.html");
  res.end();
};
