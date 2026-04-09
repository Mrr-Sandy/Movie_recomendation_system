const mongoose = require("mongoose");
const { getRequiredEnv } = require("./env");

let connectionPromise = null;

const getConnectionOptions = () => {
  const timeout = Number(process.env.DB_CONNECT_TIMEOUT_MS) || 10000;

  return {
    serverSelectionTimeoutMS: timeout,
    socketTimeoutMS: timeout,
    maxPoolSize: 10,
  };
};

const connectToDatabase = async () => {
  getRequiredEnv("MONGODB_URI");

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose.connect(
    process.env.MONGODB_URI,
    getConnectionOptions()
  );

  try {
    await connectionPromise;
    return mongoose.connection;
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
};

module.exports = {
  connectToDatabase,
};
