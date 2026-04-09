const isMissingOrPlaceholder = (value) => {
  const text = String(value || "").trim();
  if (!text) return true;
  return /<user>|<pass>|your_.*_here/i.test(text);
};

const createConfigError = (message) => {
  const error = new Error(message);
  error.statusCode = 500;
  error.code = "CONFIG_ERROR";
  return error;
};

const getRequiredEnv = (key, label = key) => {
  const value = process.env[key];
  if (isMissingOrPlaceholder(value)) {
    throw createConfigError(
      `${label} is missing or still a placeholder in environment variables.`
    );
  }
  return value;
};

module.exports = {
  createConfigError,
  getRequiredEnv,
  isMissingOrPlaceholder,
};
