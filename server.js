const { app, connectToDatabase } = require("./app");

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  await connectToDatabase();

  return app.listen(PORT, () => {
    console.log(`CineMatch server running at http://localhost:${PORT}`);
  });
};

if (require.main === module) {
  startServer().catch((error) => {
    if (
      (error.name === "MongoServerError" && error.code === 18) ||
      /bad auth|authentication failed/i.test(error.message)
    ) {
      console.error(
        "Server startup failed: MongoDB authentication failed. Check MONGODB_URI credentials and ensure the Atlas database user has access."
      );
      process.exit(1);
    }

    console.error(`Server startup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;
