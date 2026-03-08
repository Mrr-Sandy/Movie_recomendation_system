import {
  clearToken,
  getCurrentUser,
  getToken,
  loginUser,
  registerUser,
  setToken,
} from "./api.js";
import { setButtonLoading, showToast } from "./utils.js";

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const switchButtons = document.querySelectorAll(".switch-btn");
const formMessage = document.getElementById("formMessage");
const passwordStrength = document.getElementById("passwordStrength");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const signupUsername = document.getElementById("signupUsername");
const signupEmail = document.getElementById("signupEmail");
const signupPassword = document.getElementById("signupPassword");
const confirmPassword = document.getElementById("confirmPassword");

const loginSubmit = document.getElementById("loginSubmit");
const signupSubmit = document.getElementById("signupSubmit");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const setFormMessage = (message, type = "") => {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`.trim();
};

const setFieldError = (fieldId, message) => {
  const errorEl = document.getElementById(fieldId);
  if (!errorEl) return;
  errorEl.textContent = message || "";
  errorEl.classList.toggle("show", Boolean(message));
};

const getPasswordStrength = (password) => {
  const value = String(password || "");
  let score = 0;

  if (value.length >= 6) score += 1;
  if (value.length >= 10) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value)) score += 1;

  if (score <= 2) return { label: "Weak", color: "#ff8f8f" };
  if (score <= 4) return { label: "Medium", color: "#f0c040" };
  return { label: "Strong", color: "#80e6a8" };
};

const validateLogin = () => {
  let valid = true;

  if (!emailRegex.test(loginEmail.value.trim())) {
    setFieldError("loginEmailError", "Enter a valid email address");
    valid = false;
  } else {
    setFieldError("loginEmailError", "");
  }

  if (loginPassword.value.trim().length < 6) {
    setFieldError("loginPasswordError", "Password must be at least 6 characters");
    valid = false;
  } else {
    setFieldError("loginPasswordError", "");
  }

  return valid;
};

const validateSignup = () => {
  let valid = true;

  if (signupUsername.value.trim().length < 3) {
    setFieldError("signupUsernameError", "Username must be at least 3 characters");
    valid = false;
  } else {
    setFieldError("signupUsernameError", "");
  }

  if (!emailRegex.test(signupEmail.value.trim())) {
    setFieldError("signupEmailError", "Enter a valid email address");
    valid = false;
  } else {
    setFieldError("signupEmailError", "");
  }

  if (signupPassword.value.length < 6) {
    setFieldError("signupPasswordError", "Password must be at least 6 characters");
    valid = false;
  } else {
    setFieldError("signupPasswordError", "");
  }

  if (confirmPassword.value !== signupPassword.value) {
    setFieldError("confirmPasswordError", "Passwords do not match");
    valid = false;
  } else {
    setFieldError("confirmPasswordError", "");
  }

  return valid;
};

const activateForm = (target) => {
  switchButtons.forEach((btn) => {
    const active = btn.dataset.target === target;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });

  loginForm.classList.toggle("active", target === "login");
  signupForm.classList.toggle("active", target === "signup");
  setFormMessage("");
};

const handlePasswordStrength = () => {
  const { label, color } = getPasswordStrength(signupPassword.value);
  passwordStrength.textContent = `Strength: ${label}`;
  passwordStrength.style.color = color;
};

const attachRealtimeValidation = () => {
  loginEmail.addEventListener("input", () => {
    if (loginEmail.value && !emailRegex.test(loginEmail.value.trim())) {
      setFieldError("loginEmailError", "Invalid email format");
    } else {
      setFieldError("loginEmailError", "");
    }
  });

  signupEmail.addEventListener("input", () => {
    if (signupEmail.value && !emailRegex.test(signupEmail.value.trim())) {
      setFieldError("signupEmailError", "Invalid email format");
    } else {
      setFieldError("signupEmailError", "");
    }
  });

  signupPassword.addEventListener("input", () => {
    handlePasswordStrength();
    if (confirmPassword.value && confirmPassword.value !== signupPassword.value) {
      setFieldError("confirmPasswordError", "Passwords do not match");
    } else {
      setFieldError("confirmPasswordError", "");
    }
  });

  confirmPassword.addEventListener("input", () => {
    if (confirmPassword.value && confirmPassword.value !== signupPassword.value) {
      setFieldError("confirmPasswordError", "Passwords do not match");
    } else {
      setFieldError("confirmPasswordError", "");
    }
  });
};

const attachPasswordToggles = () => {
  document.querySelectorAll(".password-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;

      const shouldShow = input.type === "password";
      input.type = shouldShow ? "text" : "password";
      button.textContent = shouldShow ? "Hide" : "Show";
    });
  });
};

const handleLoginSubmit = async (event) => {
  event.preventDefault();
  setFormMessage("");

  if (!validateLogin()) return;

  setButtonLoading(loginSubmit, true, "Signing in...");

  try {
    const data = await loginUser({
      email: loginEmail.value.trim(),
      password: loginPassword.value,
    });

    setToken(data.token);
    setFormMessage("Login successful. Redirecting...", "success");
    showToast("Welcome back to CineMatch", "success");
    window.setTimeout(() => {
      window.location.href = "/dashboard.html";
    }, 450);
  } catch (error) {
    setFormMessage(error.message, "error");
    showToast(error.message, "error");
  } finally {
    setButtonLoading(loginSubmit, false);
  }
};

const handleSignupSubmit = async (event) => {
  event.preventDefault();
  setFormMessage("");

  if (!validateSignup()) return;

  setButtonLoading(signupSubmit, true, "Creating...");

  try {
    const data = await registerUser({
      username: signupUsername.value.trim(),
      email: signupEmail.value.trim(),
      password: signupPassword.value,
    });

    setToken(data.token);
    setFormMessage("Account created. Redirecting...", "success");
    showToast("Account created successfully", "success");
    window.setTimeout(() => {
      window.location.href = "/dashboard.html";
    }, 450);
  } catch (error) {
    setFormMessage(error.message, "error");
    showToast(error.message, "error");
  } finally {
    setButtonLoading(signupSubmit, false);
  }
};

const redirectIfAlreadyLoggedIn = async () => {
  const token = getToken();
  if (!token) return;

  try {
    await getCurrentUser();
    window.location.href = "/dashboard.html";
  } catch (_error) {
    clearToken();
  }
};

const init = async () => {
  await redirectIfAlreadyLoggedIn();

  switchButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activateForm(button.dataset.target);
    });
  });

  attachPasswordToggles();
  attachRealtimeValidation();

  loginForm.addEventListener("submit", handleLoginSubmit);
  signupForm.addEventListener("submit", handleSignupSubmit);

  handlePasswordStrength();
};

init();
