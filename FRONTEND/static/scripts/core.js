/* =========================================================================
   Kab Tak – core.js
   Shared configuration, helper functions, session handling, and API client.
   ========================================================================= */

"use strict";

/* ===================== 1. CONFIG ===================== */
const VOTE_TO_CODE = { up: "u", down: "d" };
const CODE_TO_VOTE = { u: "up", d: "down" };
const MAX_VOTES_COOKIE_LENGTH = 3800;
const CONFIG = {
  USE_MOCK_DATA: false,
  API_BASE_URL: "http://localhost:3000",
  ENDPOINTS: {
    SUMMARY: "/get_stats",
    PROJECTS: "/get_top_k",
    PROJECT_DETAIL: (id) => `/get_project/${encodeURIComponent(id)}`,
    PROJECT_PREVIEW: (id) => `/get_project/${encodeURIComponent(id)}`,
    ADJUST_VOTE: (id, op) => `/adjust_vote/${encodeURIComponent(id)}?op=${op}`,
    GET_VOTES: (id) => `/get_votes/${encodeURIComponent(id)}`,
    PROJECT_ANALYSIS: (id) => `/llm_query/${encodeURIComponent(id)}`,
    UPLOAD_PROJECT: "/projects",
    LOGIN: "/auth/login",
  },
  PAGE_SIZE: 20,
  PREVIEW_DELAY_MS: 1000,
  REQUEST_TIMEOUT_MS: 15000,
  ANALYSIS_TIMEOUT_MS: 90000,
  RISK_THRESHOLDS: { LOW_MAX: 30, MEDIUM_MAX: 60 },
  ADMIN_ROLE: "admin",
  SESSION_KEY: "kabtak_session",
  CLIENT_ID_COOKIE: "kt_client_id",
  VOTES_COOKIE: "kt_votes",
  COOKIE_MAX_AGE_DAYS: 365,
};

/* ===================== 2. HELPERS ===================== */

function escapeHTML(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

function truncateText(text, maxLength) {
  const str = String(text ?? "");
  return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
}

function capitalizeWords(text) {
  if (!text) return "";
  return String(text)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function toNumber(value) {
  return value === null || value === undefined || value === "" ? NaN : Number(value);
}

function normalizeRisk(risk) {
  if (!Number.isFinite(risk)) return null;
  return risk <= 1 ? risk * 100 : risk;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
function humanizeKey(key) {
  const text = String(key).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function formatNumber(n) {
  return Number.isFinite(n) ? new Intl.NumberFormat("en-IN").format(n) : "–";
}

function formatPercent(fraction) {
  if (!Number.isFinite(fraction)) return "N/A";
  const val = fraction <= 1 ? fraction * 100 : fraction;
  return `${Math.round(val)}`;
}

function formatCrore(value) {
  if (!Number.isFinite(value)) return "Not available";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)} cr`;
}

function analysisHTML(a) {
  const hasContent = a.summary || a.keyFindings.length || a.riskFactors.length ||
    a.recommendations.length || Object.keys(a.extra).length;
  
  if (!hasContent) {
    return `<div class="text-center text-muted py-4"><p class="mb-0">The analysis returned no data.</p></div>`;
  }

  const levelKey = String(a.riskLevel ?? "").toLowerCase();
  const level = RISK_STYLES[levelKey];
  
  const riskBadgeHtml = level 
    ? `<span class="badge ${level.badge} px-3 py-2 fs-6 shadow-sm">Risk Level: ${level.label}</span>`
    : "";
  
  const confidenceHtml = Number.isFinite(a.confidence)
    ? `<span class="badge bg-info text-dark px-3 py-2 fs-6 shadow-sm">Confidence: ${formatPercent(a.confidence)}%</span>`
    : "";

  const timeHtml = a.generatedAt
    ? `<span class="badge bg-white text-dark border px-3 py-2 fs-6 shadow-sm">Generated: ${formatDateTime(a.generatedAt)}</span>`
    : "";

  return `
    <div class="analysis-container">
      

      ${a.summary ? `
        <div class="card border-0 bg-primary bg-opacity-10 border-start border-primary border-4 shadow-sm mb-4">
          <div class="card-body">
            <h3 class="h6 text-primary fw-bold mb-2">Executive Summary</h3>
            <p class="card-text text-dark mb-0 lh-base">${escapeHTML(a.summary)}</p>
          </div>
        </div>
      ` : ""}

      ${listSection("Key Findings", a.keyFindings, "border-info text-info")}
      ${riskFactorsSection(a.riskFactors)}
      ${listSection("Recommendations", a.recommendations, "border-success text-success")}
      ${Object.keys(a.extra).length ? renderExtraDetails(a.extra) : ""}
    </div>`;
}

function renderJSONValue(value, depth = 0) {
  if (value === null || value === undefined) return `<span class="text-secondary">Not available</span>`;
  if (Array.isArray(value)) {
    if (!value.length) return `<span class="text-secondary">None</span>`;
    return `<ul class="mb-0 ps-3">${value.map((v) => `<li>${renderJSONValue(v, depth + 1)}</li>`).join("")}</ul>`;
  }
  if (typeof value === "object") {
    if (depth > 4) return `<code>${escapeHTML(JSON.stringify(value))}</code>`;
    return `<dl class="row mb-0">${Object.entries(value).map(([k, v]) => `
      <dt class="col-sm-4 fw-normal text-secondary">${escapeHTML(humanizeKey(k))}</dt>
      <dd class="col-sm-8 mb-1">${renderJSONValue(v, depth + 1)}</dd>`).join("")}</dl>`;
  }
  return escapeHTML(String(value));
}


function formatDate(iso) {
  if (!iso) return "Not available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const RISK_STYLES = {
  low:    { label: "Low",    badge: "text-bg-success", bar: "bg-success" },
  medium: { label: "Medium", badge: "text-bg-warning", bar: "bg-warning" },
  high:   { label: "High",   badge: "text-bg-danger",  bar: "bg-danger" },
};

function riskLevel(risk) {
  const norm = normalizeRisk(risk);
  if (norm === null) return null;
  if (norm <= CONFIG.RISK_THRESHOLDS.LOW_MAX) return "low";
  if (norm <= CONFIG.RISK_THRESHOLDS.MEDIUM_MAX) return "medium";
  return "high";
}

function riskBadge(risk) {
  const level = riskLevel(risk);
  if (!level) return `<span class="badge text-bg-secondary">N/A</span>`;
  const style = RISK_STYLES[level];
  return `<span class="badge ${style.badge}">${formatPercent(risk)}<span class="visually-hidden">, ${style.label} risk</span></span>`;
}

function combinedRiskCell(risk) {
  const level = riskLevel(risk);
  if (!level) return riskBadge(risk);
  const style = RISK_STYLES[level];
  return `
    <div class="d-flex align-items-center gap-2">
      <span class="badge ${style.badge}">${formatPercent(risk)}</span>
    </div>`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function loadingHTML(text) {
  return `
    <div class="d-flex align-items-center gap-2 small">
      <span class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
      ${escapeHTML(text)}
    </div>`;
}

/* ===================== 3. COOKIES & SESSION ===================== */

function getCookie(name) {
  const prefix = `${name}=`;
  const match = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (!match) return null;
  try { return decodeURIComponent(match.slice(prefix.length)); } catch { return null; }
}

function setCookie(name, value, maxAgeDays = CONFIG.COOKIE_MAX_AGE_DAYS) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeDays * 86400}; Path=/; SameSite=Lax${secure}`;
}

function getClientId() {
  let id = getCookie(CONFIG.CLIENT_ID_COOKIE);
  if (!id) {
    id = window.crypto?.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  setCookie(CONFIG.CLIENT_ID_COOKIE, id);
  return id;
}

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY)); } catch { return null; }
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

/* ===================== 4. DATA ADAPTERS ===================== */

function adaptSummary(raw) {
  const predicted = toNumber(raw.predicted) || 0;
  const tbtp = toNumber(raw.tbtp) || 0;
  const tytp = toNumber(raw.tytp) || 0;
  const total = toNumber(raw.total) || predicted + tbtp + tytp;
  return { predicted, tbtp, tytp, total };
}



function adaptProject(raw) {
  const timeRisk = toNumber(raw.time_risk);
  const costRisk = toNumber(raw.cost_risk);
  const combined = toNumber(raw.combined_risk);
  const code = raw.code ?? raw.id ?? "";
  return {
    id: String(code),
    name: raw.name ?? "Unnamed project",
    agency: raw.agency ?? "Not available",
    state: raw.state ?? "Not available",
    timeRisk,
    costRisk,
    combinedRisk: Number.isFinite(combined) ? combined : Math.max(timeRisk, costRisk),
  };
}

function adaptProjectPage(raw) {
  const rawItems = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
  const items = rawItems.map(adaptProject);
  return {
    items,
    page: toNumber(raw?.page) || 1,
    total: toNumber(raw?.total) || items.length,
    hasMore: Boolean(raw?.has_more),
  };
}

function adaptProjectDetail(raw) {
  return { ...adaptPreview(raw), reviews: adaptReviewCounts(raw?.reviews) };
}
function adaptReviewCounts(raw) {
  return {
    up: toNumber(raw?.up ?? raw?.upvotes ?? raw?.up_votes) || 0,
    down: toNumber(raw?.down ?? raw?.downvotes ?? raw?.down_votes) || 0,
  };
}

function adaptPreview(raw) {
  let name = raw.name ?? "Unnamed project";
  let agency = raw.agency ?? "Not available";
  let state = raw.state ?? "Not available";

  if (typeof raw.name === "string" && raw.name.includes("___")) {
    const parts = raw.name.split("___");
    agency = capitalizeWords(parts[0]);
    name = capitalizeWords(parts[1]);
  }

  const history = Array.isArray(raw.history) && raw.history.length > 0 ? raw.history[0] : {};
  if (history.state) state = capitalizeWords(history.state);

  let startDate = raw.start_date ?? null;
  if (raw.start_date_revised && typeof raw.start_date_revised === "string") {
    const s_date = raw.start_date_revised.split("/");
    if (s_date.length === 2) {
      const month = parseInt(s_date[0], 10);
      const yr = parseInt(s_date[1], 10);
      if (Number.isFinite(month) && Number.isFinite(yr)) {
        startDate = new Date(yr, month - 1, 1).toISOString();
      }
    }
  }

  return {
    ...adaptProject(raw),
    name,
    agency,
    state,
    description: raw.description ?? "",
    startDate: startDate || raw.start_date,
    expectedEnd: raw.end_date_revised ?? raw.expected_end ?? null,
    sanctionedCostCr: toNumber(raw.project_budget_revised ?? raw.sanctioned_cost_cr),
    expenditureCr: toNumber(raw.cspend ?? raw.expenditure_cr),
    progressPct: toNumber(history.progress ?? raw.physical_progress_pct),
    lastUpdated: history.report_date ?? raw.last_updated ?? null,
  };
}

/* ===================== 5. MOCK SERVICE ===================== */

function mulberry32(seed) {
  let a = seed;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mock = (() => {
  const rand = mulberry32(26103);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const round = (n, digits = 2) => Number(n.toFixed(digits));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const TYPES = ["Highway package", "Rail overbridge", "Metro corridor", "Water supply scheme", "Power substation", "Hospital block"];
  const STATES = ["Tamil Nadu", "Telangana", "Maharashtra", "Uttar Pradesh", "Gujarat", "Odisha"];
  const SUMMARY = { predicted: 137, tbtp: 28, tytp: 35 };

  const projects = Array.from({ length: SUMMARY.predicted }, (_, i) => {
    const timeRisk = round(rand());
    const costRisk = round(rand());
    const startYear = 2019 + Math.floor(rand() * 5);
    const month = String(1 + Math.floor(rand() * 12)).padStart(2, "0");
    const sanctioned = round(50 + rand() * 950, 1);
    return {
      id: `PRJ-${String(i + 1).padStart(4, "0")}`,
      name: `${pick(TYPES)} ${i + 1}`,
      agency: `Implementing agency ${1 + Math.floor(rand() * 12)}`,
      state: pick(STATES),
      time_risk: timeRisk,
      cost_risk: costRisk,
      combined_risk: Math.max(timeRisk, costRisk),
      description: "Mock project description for UI testing.",
      start_date: `${startYear}-${month}-01`,
      expected_end: `${startYear + 2 + Math.floor(rand() * 4)}-${month}-01`,
      sanctioned_cost_cr: sanctioned,
      expenditure_cr: round(sanctioned * rand(), 1),
      physical_progress_pct: Math.floor(rand() * 100),
      last_updated: "2026-09-01",
    };
  });

  const sortedByRisk = [...projects].sort((a, b) =>
    a.combined_risk - b.combined_risk || Math.min(a.time_risk, a.cost_risk) - Math.min(b.time_risk, b.cost_risk)
  );

  return {
    async getSummary() {
      await delay(300);
      return { total: SUMMARY.predicted + SUMMARY.tbtp + SUMMARY.tytp, ...SUMMARY };
    },
    async getProjects(page, limit) {
      await delay(500);
      const start = (page - 1) * limit;
      return {
        items: sortedByRisk.slice(start, start + limit),
        page,
        limit,
        total: sortedByRisk.length,
        has_more: start + limit < sortedByRisk.length,
      };
    },
    async getProjectPreview(id) {
      await delay(400);
      const project = projects.find((p) => p.id === id);
      if (!project) throw httpError(404, `Project ${id} not found`);
      return project;
    },
  };
})();

/* ===================== 6. API CLIENT ===================== */

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

const api = {
  async getSummary() {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.getSummary()
      : await apiRequest(CONFIG.ENDPOINTS.SUMMARY);
    return adaptSummary(raw);
  },

  async getProjects(page, limit) {
    const query = new URLSearchParams({ page, limit });
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.getProjects(page, limit)
      : await apiRequest(`${CONFIG.ENDPOINTS.PROJECTS}?${query}`);
    return adaptProjectPage(raw);
  },

  async getProjectPreview(id) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.getProjectPreview(id)
      : await apiRequest(CONFIG.ENDPOINTS.PROJECT_PREVIEW(id));
    return adaptPreview(raw);
  },

  async getProject(id) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.getProject(id)
      : await apiRequest(CONFIG.ENDPOINTS.PROJECT_DETAIL(id));
    return adaptProjectDetail(raw);
  },

  async getVotes(id) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.getVotes(id)
      : await apiRequest(CONFIG.ENDPOINTS.GET_VOTES(id));
    return adaptReviewCounts(raw);
  },

  async submitReview(id, oldVote, newVote, currentCounts) {
    if (CONFIG.USE_MOCK_DATA) {
      return await mock.submitReview(id, newVote, getClientId());
    }

    const ops = [];
    if (oldVote === "up") ops.push(1);   // Remove existing upvote
    if (oldVote === "down") ops.push(3); // Remove existing downvote
    if (newVote === "up") ops.push(0);   // Add new upvote
    if (newVote === "down") ops.push(2); // Add new downvote

    for (const op of ops) {
      await apiRequest(CONFIG.ENDPOINTS.ADJUST_VOTE(id, op), { method: "GET" });
    }

    const newCounts = { ...currentCounts };
    if (oldVote === "up") newCounts.up = Math.max(0, newCounts.up - 1);
    if (oldVote === "down") newCounts.down = Math.max(0, newCounts.down - 1);
    if (newVote === "up") newCounts.up += 1;
    if (newVote === "down") newCounts.down += 1;

    return newCounts;
  },

  async analyseProject(id) {
    console.log(id);
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.analyseProject(id)
      : await apiRequest(CONFIG.ENDPOINTS.PROJECT_ANALYSIS(id), {
          timeoutMs: CONFIG.ANALYSIS_TIMEOUT_MS,
        });
    return adaptAnalysis(raw);
  },

  async login(username, password) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.login(username, password)
      : await apiRequest(CONFIG.ENDPOINTS.LOGIN, { method: "POST", body: { username, password } });

    const session = adaptLogin(raw, username);
    if (!session) {
      throw httpError(401, "Invalid credentials");
    }
    return session;
  },

  async uploadProject(payload) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.uploadProject(payload)
      : await apiRequest(CONFIG.ENDPOINTS.UPLOAD_PROJECT, { method: "POST", body: payload });
    return { id: String(raw.id) };
  },
};