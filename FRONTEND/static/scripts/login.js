"use strict";

/* =========================================================================
   1. CONFIGURATION
========================================================================= */
const CONFIG = {
  USE_MOCK_DATA: false, // Set to true to fallback to mock login testing
  API_BASE_URL: "http://localhost:3000",
  ENDPOINTS: {
    LOGIN: "/auth/login",
  },
  REQUEST_TIMEOUT_MS: 15000,
  ADMIN_ROLE: "admin",
  SESSION_KEY: "kabtak_session",
};

/* =========================================================================
   2. UTILITIES & SESSION MANAGEMENT
========================================================================= */
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function capitalizeWords(text) {
  if (!text) return "";
  return String(text)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function safeNextPage(value) {
  return /^[a-z0-9-]+\.html$/i.test(value ?? "") ? value : "index.html";
}

function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(CONFIG.SESSION_KEY);
}

function isAdmin() {
  return getSession()?.role === CONFIG.ADMIN_ROLE;
}

function initNav() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".kt-navbar .nav-link").forEach((link) => {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
  });

  const admin = isAdmin();
  document.querySelectorAll("[data-admin-only]").forEach((el) => { el.hidden = !admin; });

  const loginLink = document.getElementById("nav-login");
  const logoutButton = document.getElementById("nav-logout");
  if (loginLink) loginLink.hidden = admin;
  if (logoutButton) {
    logoutButton.hidden = !admin;
    logoutButton.addEventListener("click", () => {
      clearSession();
      window.location.href = "index.html";
    });
  }
}

/* =========================================================================
   3. BACKEND ADAPTERS
========================================================================= */
function adaptLogin(raw, username = "admin") {
  if (raw && typeof raw === "object" && raw.status === 0) {
    return {
      token: raw.token || "admin-session-token",
      role: raw.role || CONFIG.ADMIN_ROLE,
      name: raw.name || capitalizeWords(username) || "Administrator",
    };
  }
  return null;
}

/* =========================================================================
   4. NETWORK / API LAYER
========================================================================= */
function getAuthHeader() {
  const token = getSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, { method = "GET", body, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS } = {}) {
  const isFormData = body instanceof FormData;
  const headers = { ...getAuthHeader() };
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : (isFormData ? body : JSON.stringify(body)),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 401) clearSession();
      throw httpError(response.status, `${method} ${path} failed with status ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw httpError(408, `${method} ${path} timed out`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const mock = {
  async login(username, password) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (username === "admin" && password === "admin123") {
      return { status: 0, token: "mock-admin-token", role: "admin", name: "Administrator" };
    }
    return false;
  }
};

const api = {
  async login(username, password) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.login(username, password)
      : await apiRequest(CONFIG.ENDPOINTS.LOGIN, { method: "POST", body: { username, password } });

    const session = adaptLogin(raw, username);
    if (!session) {
      throw httpError(401, "Invalid credentials");
    }
    return session;
  }
};

/* =========================================================================
   5. UI CONTROLLERS
========================================================================= */
function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const message = document.getElementById("login-message");
  const showMessage = (type, text) => {
    message.className = `alert alert-${type}`;
    message.textContent = text;
    message.classList.remove("d-none");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    const spinner = form.querySelector(".kt-auth-submit-spinner");

    button.disabled = true;
    if (spinner) spinner.classList.remove("d-none");

    try {
      const session = await api.login(form.elements.username.value.trim(), form.elements.password.value);

      if (!session) {
        clearSession();
        showMessage("danger", "This login is only for administrators. Citizens can view all project information without logging in.");
        return;
      }
      saveSession(session);
      initNav(); 
      showMessage("success", "Logged in. Redirecting…");
      const next = safeNextPage(new URLSearchParams(window.location.search).get("next"));
      setTimeout(() => { window.location.href = next; }, 800);
    } catch (error) {
      console.error("Login failed:", error);
      showMessage("danger", error.status === 401
        ? "Wrong admin ID or password."
        : "Couldn't reach the server. Try again later.");
    } finally {
      button.disabled = false;
      if (spinner) spinner.classList.add("d-none");
    }
  });
}

function initPasswordToggle() {
  const toggleBtn = document.getElementById("toggle-password");
  const pwInput = document.getElementById("password");
  
  if (toggleBtn && pwInput) {
    toggleBtn.addEventListener("click", () => {
      const icon = toggleBtn.querySelector("i");
      if (pwInput.type === "password") {
        pwInput.type = "text";
        icon.className = "bi bi-eye-slash";
      } else {
        pwInput.type = "password";
        icon.className = "bi bi-eye";
      }
    });
  }
}

/* =========================================================================
   6. INITIALIZATION
========================================================================= */
document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initLogin();
  initPasswordToggle();
});