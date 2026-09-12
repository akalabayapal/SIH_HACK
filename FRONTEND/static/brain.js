/* =========================================================================
   Kab Tak – brain.js
   Shared script for all pages. Each feature only runs if its elements
   exist on the current page.

   BACKEND CONTRACT (proposed – confirm with backend teammate)
   -------------------------------------------------------------------------
   Risk scores are numbers from 0 to 1. combined_risk = max(time_risk, cost_risk).
   Protected endpoints expect the header:  Authorization: Bearer <token>

   1) GET  /summary
      -> { "total": 200, "predicted": 137, "tbtp": 28, "tytp": 35 }

   2) GET  /projects?page=1&limit=20&sort=combined_risk_asc
      Predicted projects only. Sorted ON THE SERVER by combined_risk
      ascending; ties broken by min(time_risk, cost_risk) ascending.
      -> { "items": [ { "id", "name", "agency", "state",
                        "time_risk", "cost_risk", "combined_risk" } ],
           "page": 1, "limit": 20, "total": 137, "has_more": true }

   3) GET  /projects/{id}/preview
      -> { "id", "name", "agency", "state", "description",
           "start_date": "2021-04-01", "expected_end": "2025-03-31",
           "sanctioned_cost_cr": 450.5, "expenditure_cr": 210.0,
           "physical_progress_pct": 46, "time_risk", "cost_risk",
           "combined_risk", "last_updated": "2026-09-01" }

   4) GET  /projects/{id}
      -> same fields as (3) plus  "reviews": { "up": 12, "down": 3 }

   5) POST /projects/{id}/reviews
      body { "vote": "up" | "down" | null, "client_id": "<uuid>" }
      null = remove this client's vote (back to neutral). One vote per
      client_id per project; a new vote replaces the old one.
      -> { "up": 13, "down": 3 }
      The browser keeps its own vote in the "kt_votes" cookie and its
      anonymous ID in the "kt_client_id" cookie.

   6) POST /projects/{id}/analyse                     (LLM analysis)
      -> { "project_id", "generated_at": "2026-09-11T10:30:00Z",
           "summary": "...", "risk_level": "low" | "medium" | "high",
           "confidence": 0.78,
           "key_findings": ["..."],
           "risk_factors": [ { "factor", "impact", "detail" } ],
           "recommendations": ["..."] }
      Any extra keys are shown under "Other details".

   7) POST /auth/login
      body { "username", "password" }
      -> { "token": "...", "role": "admin", "name": "..." }
      401 for wrong credentials. The frontend only accepts role "admin".

    8) POST /projects                                   (admin only)
      Content-Type: multipart/form-data
      fields: document (PDF file), start_month "YYYY-MM",
              expected_end_month "YYYY-MM"
      The backend extracts name, agency, state, costs and progress from
      the PDF; the frontend no longer sends them.
      -> { "id": "PRJ-0201" }
      MUST return 401/403 for missing or non-admin tokens, and reject
      files that are not PDFs or exceed the size limit.

   If field names differ, change only the adapt* functions (section 4) and
   buildProjectPayload (section 12). To go live: set USE_MOCK_DATA to false,
   set API_BASE_URL, and delete the mock section (section 5).
   ========================================================================= */

"use strict";

/* ===================== 1. CONFIG ===================== */

const CONFIG = {
  USE_MOCK_DATA: true,                        // TODO(backend): set to false when the API is ready
  API_BASE_URL: "http://localhost:8000/api",  // TODO(backend): teammate's server URL
  ENDPOINTS: {
    SUMMARY: "/summary",
    PROJECTS: "/projects",
    PROJECT_DETAIL: (id) => `/projects/${encodeURIComponent(id)}`,
    PROJECT_PREVIEW: (id) => `/projects/${encodeURIComponent(id)}/preview`,
    PROJECT_REVIEWS: (id) => `/projects/${encodeURIComponent(id)}/reviews`,
    PROJECT_ANALYSIS: (id) => `/projects/${encodeURIComponent(id)}/analyse`,
    UPLOAD_PROJECT: "/projects",
    LOGIN: "/auth/login",
  },
  PAGE_SIZE: 20,
  PREVIEW_DELAY_MS: 1000,
  REQUEST_TIMEOUT_MS: 15000,
  ANALYSIS_TIMEOUT_MS: 90000,                 // LLM analysis can be slow
  RISK_THRESHOLDS: { LOW_MAX: 0.33, MEDIUM_MAX: 0.66 }, // TODO(ML): use the model's thresholds
  ADMIN_ROLE: "admin",                        // TODO(backend): role name returned for admins
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

function toNumber(value) {
  return value === null || value === undefined || value === "" ? NaN : Number(value);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
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
  return Number.isFinite(fraction) ? `${Math.round(fraction * 100)}%` : "N/A";
}

function formatCrore(value) {
  if (!Number.isFinite(value)) return "Not available";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value)} cr`;
}

function formatDate(iso) {
  if (!iso) return "Not available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "Not available";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const RISK_STYLES = {
  low:    { label: "Low",    badge: "text-bg-success", bar: "bg-success" },
  medium: { label: "Medium", badge: "text-bg-warning", bar: "bg-warning" },
  high:   { label: "High",   badge: "text-bg-danger",  bar: "bg-danger" },
};

function riskLevel(risk) {
  if (!Number.isFinite(risk)) return null;
  if (risk <= CONFIG.RISK_THRESHOLDS.LOW_MAX) return "low";
  if (risk <= CONFIG.RISK_THRESHOLDS.MEDIUM_MAX) return "medium";
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
  const pct = clampPercent(risk * 100);
  return `
    <div class="d-flex align-items-center gap-2">
      <div class="progress flex-grow-1 kt-risk-meter" aria-hidden="true">
        <div class="progress-bar ${style.bar}" style="width:${pct}%"></div>
      </div>
      <span class="small fw-semibold kt-rank">${pct}%</span>
      <span class="visually-hidden">, ${style.label} risk</span>
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

function humanizeKey(key) {
  const text = String(key).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Renders any JSON value as readable HTML (used for unknown analysis fields)
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

// Only allow redirects to local pages like "upload.html"
function safeNextPage(value) {
  return /^[a-z0-9-]+\.html$/i.test(value ?? "") ? value : "index.html";
}

/* ===================== 3. SESSION + NAVBAR ===================== */

// TODO(backend): agree on token handling (an httpOnly cookie is safer than sessionStorage)
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

  // Cosmetic only: the backend must also block non-admins
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

/* ===================== 4. ADAPTERS (backend JSON <-> UI objects) ===================== */
/* TODO(backend): if field names differ from the contract above, change them here only. */

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
  return {
    id: String(raw.id),
    name: raw.name ?? "Unnamed project",
    agency: raw.agency ?? "Not available",
    state: raw.state ?? "Not available",
    timeRisk,
    costRisk,
    combinedRisk: Number.isFinite(combined) ? combined : Math.max(timeRisk, costRisk),
  };
}

function adaptProjectPage(raw) {
  const items = Array.isArray(raw.items) ? raw.items.map(adaptProject) : [];
  return {
    items,
    page: toNumber(raw.page),
    total: toNumber(raw.total) || 0,
    hasMore: Boolean(raw.has_more),
  };
}

function adaptPreview(raw) {
  return {
    ...adaptProject(raw),
    description: raw.description ?? "",
    startDate: raw.start_date,
    expectedEnd: raw.expected_end,
    sanctionedCostCr: toNumber(raw.sanctioned_cost_cr),
    expenditureCr: toNumber(raw.expenditure_cr),
    progressPct: toNumber(raw.physical_progress_pct),
    lastUpdated: raw.last_updated,
  };
}

function adaptReviewCounts(raw) {
  return { up: toNumber(raw?.up) || 0, down: toNumber(raw?.down) || 0 };
}

function adaptProjectDetail(raw) {
  return { ...adaptPreview(raw), reviews: adaptReviewCounts(raw.reviews) };
}

const ANALYSIS_KNOWN_KEYS = ["project_id", "generated_at", "summary", "risk_level",
  "confidence", "key_findings", "risk_factors", "recommendations"];

function adaptAnalysis(raw) {
  const extra = Object.fromEntries(
    Object.entries(raw ?? {}).filter(([key]) => !ANALYSIS_KNOWN_KEYS.includes(key)));
  return {
    projectId: raw?.project_id,
    generatedAt: raw?.generated_at,
    summary: raw?.summary ?? "",
    riskLevel: raw?.risk_level,
    confidence: toNumber(raw?.confidence),
    keyFindings: Array.isArray(raw?.key_findings) ? raw.key_findings : [],
    riskFactors: Array.isArray(raw?.risk_factors) ? raw.risk_factors : [],
    recommendations: Array.isArray(raw?.recommendations) ? raw.recommendations : [],
    extra,
  };
}

function adaptLogin(raw) {
  return { token: raw.token, role: raw.role, name: raw.name ?? "" };
}

/* ===================== 5. MOCK DATA (delete once the backend is live) ===================== */

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
  const rand = mulberry32(26103); // fixed seed so mock data stays the same on every reload
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const round = (n, digits = 2) => Number(n.toFixed(digits));
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const TYPES = ["Highway package", "Rail overbridge", "Metro corridor", "Water supply scheme",
                 "Power substation", "Hospital block", "Irrigation canal", "Rural road package"];
  const STATES = ["Tamil Nadu", "Telangana", "Maharashtra", "Uttar Pradesh",
                  "Gujarat", "Odisha", "Assam", "Karnataka"];
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
      description: "Mock project for UI testing. The real description will come from the backend.",
      start_date: `${startYear}-${month}-01`,
      expected_end: `${startYear + 2 + Math.floor(rand() * 4)}-${month}-01`,
      sanctioned_cost_cr: sanctioned,
      expenditure_cr: round(sanctioned * rand(), 1),
      physical_progress_pct: Math.floor(rand() * 100),
      last_updated: "2026-09-01",
      reviews: { up: Math.floor(rand() * 40), down: Math.floor(rand() * 15) },
    };
  });

  const sortedByRisk = [...projects].sort((a, b) =>
    a.combined_risk - b.combined_risk ||
    Math.min(a.time_risk, a.cost_risk) - Math.min(b.time_risk, b.cost_risk));

  const votes = new Map(); // "projectId:clientId" -> "up" | "down"

  const findProject = (id) => {
    const project = projects.find((p) => p.id === id);
    if (!project) throw httpError(404, `Project ${id} not found`);
    return project;
  };

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
      return findProject(id);
    },

    async getProject(id) {
      await delay(400);
      const project = findProject(id);
      // Mock only: mock counts reset on reload, so re-apply this browser's cookie vote
      const key = `${id}:${getClientId()}`;
      const saved = getStoredVotes().get(id);
      if (saved && !votes.has(key)) {
        project.reviews[saved] += 1;
        votes.set(key, saved);
      }
      return { ...project, reviews: { ...project.reviews } };
    },

    async submitReview(id, vote, clientId) {
      await delay(300);
      const project = findProject(id);
      const key = `${id}:${clientId}`;
      const previous = votes.get(key) ?? null;
      if (previous !== vote) {
        if (previous) project.reviews[previous] -= 1;
        if (vote) {
          project.reviews[vote] += 1;
          votes.set(key, vote);
        } else {
          votes.delete(key);
        }
      }
      return { ...project.reviews };
    },

    async analyseProject(id) {
      await delay(2000);
      const p = findProject(id);
      const spentShare = p.sanctioned_cost_cr ? Math.round((p.expenditure_cr / p.sanctioned_cost_cr) * 100) : 0;
      return {
        project_id: p.id,
        generated_at: new Date().toISOString(),
        summary: `Mock analysis for ${p.name}. The real text will come from the LLM service.`,
        risk_level: riskLevel(toNumber(p.combined_risk)) ?? "unknown",
        confidence: 0.78,
        key_findings: [
          `Physical progress is ${p.physical_progress_pct}%.`,
          `${spentShare}% of the sanctioned cost has been spent.`,
        ],
        risk_factors: [
          { factor: "Schedule", impact: riskLevel(toNumber(p.time_risk)) ?? "unknown", detail: `Time risk is ${formatPercent(toNumber(p.time_risk))}.` },
          { factor: "Cost", impact: riskLevel(toNumber(p.cost_risk)) ?? "unknown", detail: `Cost risk is ${formatPercent(toNumber(p.cost_risk))}.` },
        ],
        recommendations: ["Mock recommendation 1.", "Mock recommendation 2."],
        model: "mock-llm", // unknown key: appears under "Other details"
      };
    },

    async login(username, password) {
      await delay(400);
      // Mock admin credentials: admin / admin123
      if (username === "admin" && password === "admin123") {
        return { token: "mock-admin-token", role: "admin", name: "Administrator" };
      }
      throw httpError(401, "Invalid credentials");
    },

    async uploadProject(payload) {
      await delay(600);
      if (!isAdmin()) throw httpError(403, "Admin only");
      const id = `PRJ-${String(projects.length + 1).padStart(4, "0")}`;
      const file = payload.get("document");
      // Mock only: the real backend reads these details out of the PDF
      projects.push({
        id,
        name: file?.name?.replace(/\.pdf$/i, "") || "Uploaded project",
        agency: "Pending extraction",
        state: "Pending extraction",
        description: "Details will be extracted from the uploaded PDF.",
        start_date: `${payload.get("start_month")}-01`,
        expected_end: `${payload.get("expected_end_month")}-01`,
        sanctioned_cost_cr: null,
        expenditure_cr: null,
        physical_progress_pct: null,
        time_risk: null, cost_risk: null, combined_risk: null,
        last_updated: new Date().toISOString().slice(0, 10),
        reviews: { up: 0, down: 0 },
      });
      return { id };
    },
  };
})();

/* ===================== 6. API LAYER ===================== */

function getAuthHeader() {
  const token = getSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, { method = "GET", body, timeoutMs = CONFIG.REQUEST_TIMEOUT_MS } = {}) {
  const isFormData = body instanceof FormData;
  const headers = { ...getAuthHeader() };
  // The browser sets Content-Type (with the multipart boundary) for FormData
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
      if (response.status === 401) clearSession(); // token missing or expired
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
    const query = new URLSearchParams({ page, limit, sort: "combined_risk_asc" });
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

  async submitReview(id, vote, clientId) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.submitReview(id, vote, clientId)
      : await apiRequest(CONFIG.ENDPOINTS.PROJECT_REVIEWS(id), {
          method: "POST",
          body: { vote, client_id: clientId },
        });
    return adaptReviewCounts(raw);
  },

  async analyseProject(id) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.analyseProject(id)
      : await apiRequest(CONFIG.ENDPOINTS.PROJECT_ANALYSIS(id), {
          method: "POST",
          timeoutMs: CONFIG.ANALYSIS_TIMEOUT_MS,
        });
    return adaptAnalysis(raw);
  },

  async login(username, password) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.login(username, password)
      : await apiRequest(CONFIG.ENDPOINTS.LOGIN, { method: "POST", body: { username, password } });
    return adaptLogin(raw);
  },

  async uploadProject(payload) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.uploadProject(payload)
      : await apiRequest(CONFIG.ENDPOINTS.UPLOAD_PROJECT, { method: "POST", body: payload });
    return { id: String(raw.id) };
  },
};

/* ===================== 7. PREDICTION SUMMARY + PIE CHART (index.html) ===================== */

const COVERAGE_KEYS = [
  { key: "predicted", label: "Predicted", cssVar: "--kt-predicted" },
  { key: "tbtp", label: "TBTP (too bad to predict)", cssVar: "--kt-tbtp" },
  { key: "tytp", label: "TYTP (too young to predict)", cssVar: "--kt-tytp" },
];

let coverageChart = null;

async function initSummary() {
  if (!document.getElementById("summary")) return;
  try {
    const summary = await api.getSummary();
    renderSummary(summary);
    renderCoverageChart(summary);
  } catch (error) {
    console.error("Failed to load summary:", error);
    const alert = document.getElementById("summary-error");
    if (alert) alert.hidden = false;
  }
}

function renderSummary(summary) {
  setText("total-projects", formatNumber(summary.total));
  COVERAGE_KEYS.forEach(({ key }) => {
    const count = summary[key];
    const pct = summary.total ? (count / summary.total) * 100 : 0;
    setText(`stat-${key}-count`, formatNumber(count));
    setText(`stat-${key}-pct`, `${pct.toFixed(1)}%`);
    const bar = document.getElementById(`bar-${key}`);
    if (bar) {
      bar.style.width = `${pct}%`;
      bar.parentElement.setAttribute("aria-valuenow", pct.toFixed(1));
    }
  });
}

function renderCoverageChart(summary) {
  const canvas = document.getElementById("coverage-chart");
  if (!canvas || typeof Chart === "undefined") return;

  const styles = getComputedStyle(document.documentElement);
  const options = {
    responsive: true,
    plugins: {
      legend: { position: "bottom" },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const pct = summary.total ? ((ctx.parsed / summary.total) * 100).toFixed(1) : "0.0";
            return ` ${ctx.label}: ${formatNumber(ctx.parsed)} (${pct}%)`;
          },
        },
      },
    },
  };
  if (prefersReducedMotion()) options.animation = false;

  if (coverageChart) coverageChart.destroy();
  coverageChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: COVERAGE_KEYS.map((k) => k.label),
      datasets: [{
        data: COVERAGE_KEYS.map((k) => summary[k.key]),
        backgroundColor: COVERAGE_KEYS.map((k) => styles.getPropertyValue(k.cssVar).trim()),
        borderColor: "#ffffff",
        borderWidth: 2,
      }],
    },
    options,
  });
}

/* ===================== 8. RANKED PROJECT LIST, LAZY LOADED (index.html) ===================== */

const projectsState = { page: 0, loaded: 0, total: 0, hasMore: true, loading: false };
let projectsObserver = null;

function initProjects() {
  const sentinel = document.getElementById("projects-sentinel");
  if (!sentinel || !document.getElementById("projects-list")) return;

  projectsObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadNextProjectsPage();
  }, { rootMargin: "300px 0px" });

  projectsObserver.observe(sentinel);
}

async function loadNextProjectsPage() {
  if (projectsState.loading || !projectsState.hasMore) return;
  projectsState.loading = true;

  const sentinel = document.getElementById("projects-sentinel");
  projectsObserver.unobserve(sentinel);
  toggleProjectsSpinner(true);

  try {
    const nextPage = projectsState.page + 1;
    const result = await api.getProjects(nextPage, CONFIG.PAGE_SIZE);

    appendProjects(result.items, projectsState.loaded);
    projectsState.page = nextPage;
    projectsState.loaded += result.items.length;
    projectsState.total = result.total;
    projectsState.hasMore = result.hasMore && result.items.length > 0;
    updateProjectsCounter();

    if (projectsState.hasMore) {
      projectsObserver.observe(sentinel); // re-fires if the sentinel is still on screen
    } else {
      finishProjects();
    }
  } catch (error) {
    console.error("Failed to load projects:", error);
    toggleProjectsSpinner(false);
    showProjectsError();
  } finally {
    projectsState.loading = false;
  }
}

function appendProjects(projects, offset) {
  const list = document.getElementById("projects-list");
  const fragment = document.createDocumentFragment();
  projects.forEach((project, i) => fragment.appendChild(createProjectItem(project, offset + i + 1)));
  list.appendChild(fragment);
}

function createProjectItem(project, rank) {
  const li = document.createElement("li");
  li.className = "list-group-item kt-project-item";
  li.dataset.projectId = project.id;
  li.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-2 col-md-1 kt-rank fw-semibold text-secondary">#${rank}</div>
      <div class="col-10 col-md-5">
        <a href="project.html?id=${encodeURIComponent(project.id)}"
           class="fw-semibold text-body text-decoration-none stretched-link">${escapeHTML(project.name)}</a>
        <div class="small text-secondary">${escapeHTML(project.agency)} | ${escapeHTML(project.state)}</div>
      </div>
      <div class="col-4 col-md-2">
        <span class="small text-secondary d-block d-md-none">Time risk</span>${riskBadge(project.timeRisk)}
      </div>
      <div class="col-4 col-md-2">
        <span class="small text-secondary d-block d-md-none">Cost risk</span>${riskBadge(project.costRisk)}
      </div>
      <div class="col-4 col-md-2">
        <span class="small text-secondary d-block d-md-none">Combined</span>${combinedRiskCell(project.combinedRisk)}
      </div>
    </div>`;
  attachPreviewHandlers(li, project.id);
  return li;
}

function toggleProjectsSpinner(show) {
  const spinner = document.querySelector("#projects-sentinel .spinner-border");
  if (spinner) spinner.hidden = !show;
}

function updateProjectsCounter() {
  setText("projects-counter",
    `Showing ${formatNumber(projectsState.loaded)} of ${formatNumber(projectsState.total)} projects`);
}

function finishProjects() {
  toggleProjectsSpinner(false);
  setText("projects-status", projectsState.total === 0
    ? "No projects with risk predictions yet."
    : `All ${formatNumber(projectsState.total)} projects loaded.`);
}

function showProjectsError() {
  const status = document.getElementById("projects-status");
  status.innerHTML = `
    <div class="alert alert-warning d-inline-flex align-items-center gap-2 mb-0">
      Couldn't load more projects.
      <button type="button" class="btn btn-sm btn-outline-dark" id="projects-retry">Retry</button>
    </div>`;
  document.getElementById("projects-retry").addEventListener("click", () => {
    status.innerHTML = "";
    loadNextProjectsPage();
  });
}

/* ===================== 9. HOVER PREVIEW, 1 S DELAY (index.html) ===================== */

const previewState = { timer: null, activeId: null, anchor: null, cache: new Map() };

function initPreview() {
  const box = document.getElementById("project-preview");
  if (!box) return;
  const reposition = () => {
    if (previewState.anchor && !box.hidden) positionPreview(box, previewState.anchor);
  };
  window.addEventListener("scroll", reposition, { passive: true });
  window.addEventListener("resize", reposition);
}

function attachPreviewHandlers(element, projectId) {
  const start = () => schedulePreview(element, projectId);
  element.addEventListener("mouseenter", start);
  element.addEventListener("focusin", start);
  element.addEventListener("mouseleave", cancelPreview);
  element.addEventListener("focusout", cancelPreview);
}

function schedulePreview(anchor, projectId) {
  cancelPreview();
  previewState.timer = setTimeout(() => showPreview(anchor, projectId), CONFIG.PREVIEW_DELAY_MS);
}

function cancelPreview() {
  clearTimeout(previewState.timer);
  previewState.timer = null;
  previewState.activeId = null;
  previewState.anchor = null;
  const box = document.getElementById("project-preview");
  if (box) box.hidden = true;
}

async function showPreview(anchor, projectId) {
  const box = document.getElementById("project-preview");
  previewState.activeId = projectId;
  previewState.anchor = anchor;

  box.innerHTML = `<div class="card-body">${loadingHTML("Loading preview…")}</div>`;
  box.hidden = false;
  positionPreview(box, anchor);

  try {
    let data = previewState.cache.get(projectId);
    if (!data) {
      data = await api.getProjectPreview(projectId);
      previewState.cache.set(projectId, data);
    }
    if (previewState.activeId !== projectId) return; // pointer moved to another project
    box.innerHTML = previewHTML(data);
    positionPreview(box, anchor);
  } catch (error) {
    console.error("Failed to load preview:", error);
    if (previewState.activeId !== projectId) return;
    box.innerHTML = `<div class="card-body small text-danger">Couldn't load the preview. Try again later.</div>`;
  }
}

function previewHTML(p) {
  const progress = Number.isFinite(p.progressPct) ? clampPercent(p.progressPct) : null;
  return `
    <div class="card-header bg-body">
      <div class="fw-semibold">${escapeHTML(p.name)}</div>
      <div class="small text-secondary">${escapeHTML(p.id)}</div>
    </div>
    <div class="card-body small">
      <p class="mb-3">${escapeHTML(p.description)}</p>
      <dl class="row mb-2">
        <dt class="col-6 fw-normal text-secondary">Implementing agency</dt><dd class="col-6 mb-1">${escapeHTML(p.agency)}</dd>
        <dt class="col-6 fw-normal text-secondary">Location</dt><dd class="col-6 mb-1">${escapeHTML(p.state)}</dd>
        <dt class="col-6 fw-normal text-secondary">Start date</dt><dd class="col-6 mb-1">${formatDate(p.startDate)}</dd>
        <dt class="col-6 fw-normal text-secondary">Expected completion</dt><dd class="col-6 mb-1">${formatDate(p.expectedEnd)}</dd>
        <dt class="col-6 fw-normal text-secondary">Sanctioned cost</dt><dd class="col-6 mb-1">${formatCrore(p.sanctionedCostCr)}</dd>
        <dt class="col-6 fw-normal text-secondary">Spent so far</dt><dd class="col-6 mb-1">${formatCrore(p.expenditureCr)}</dd>
      </dl>
      <div class="mb-3">
        <div class="d-flex justify-content-between mb-1">
          <span class="text-secondary">Physical progress</span>
          <span>${progress === null ? "N/A" : `${progress}%`}</span>
        </div>
        <div class="progress kt-risk-meter" aria-hidden="true">
          <div class="progress-bar" style="width:${progress ?? 0}%"></div>
        </div>
      </div>
      <div class="d-flex justify-content-between">
        <span>Time risk ${riskBadge(p.timeRisk)}</span>
        <span>Cost risk ${riskBadge(p.costRisk)}</span>
        <span>Combined ${riskBadge(p.combinedRisk)}</span>
      </div>
    </div>
    <div class="card-footer bg-body small text-secondary">Last updated ${formatDate(p.lastUpdated)}</div>`;
}

function positionPreview(box, anchor) {
  const gap = 8;
  const rect = anchor.getBoundingClientRect();
  const boxRect = box.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const navbarHeight = document.querySelector(".kt-navbar")?.offsetHeight || 0;

  let left = Math.min(rect.right - boxRect.width, viewportWidth - boxRect.width - gap);
  left = Math.max(gap, left);

  let top = rect.bottom + gap;
  if (top + boxRect.height > viewportHeight - gap) {
    top = rect.top - boxRect.height - gap;
  }
  top = Math.max(navbarHeight + gap, top);

  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

/* ===================== 10. PROJECT PAGE: DETAILS, REVIEWS, LLM ANALYSIS (project.html) ===================== */

async function initProjectPage() {
  if (!document.getElementById("project-content")) return;

  const projectId = new URLSearchParams(window.location.search).get("id");
  if (!projectId) {
    showProjectPageError("No project selected", "Go back to the project list and choose a project.");
    return;
  }

  try {
    const project = await api.getProject(projectId);
    renderProjectPage(project);
    initReviews(project);
    document.getElementById("analyse-button").addEventListener("click", () => runAnalysis(project.id));
  } catch (error) {
    console.error("Failed to load project:", error);
    if (error.status === 404) {
      showProjectPageError("Project not found", "This project doesn't exist or has been removed.");
    } else {
      showProjectPageError("Project unavailable", "Couldn't load this project. Refresh the page to try again.");
    }
  }
}

function showProjectPageError(title, text) {
  setText("project-title", title);
  const alert = document.getElementById("project-error");
  alert.textContent = text;
  alert.hidden = false;
}

function renderProjectPage(p) {
  document.title = `${p.name} | Kab Tak`;
  setText("project-title", p.name);
  setText("project-id-label", `Project ID ${p.id}`);
  setText("project-description", p.description || "No description available.");

  const facts = [
    ["Implementing agency", escapeHTML(p.agency)],
    ["Location", escapeHTML(p.state)],
    ["Start date", formatDate(p.startDate)],
    ["Expected completion", formatDate(p.expectedEnd)],
    ["Sanctioned cost", formatCrore(p.sanctionedCostCr)],
    ["Spent so far", formatCrore(p.expenditureCr)],
    ["Last updated", formatDate(p.lastUpdated)],
  ];
  document.getElementById("project-facts").innerHTML = facts.map(([label, value]) => `
    <dt class="col-sm-5 fw-normal text-secondary">${label}</dt>
    <dd class="col-sm-7">${value}</dd>`).join("");

  const progress = Number.isFinite(p.progressPct) ? clampPercent(p.progressPct) : null;
  setText("project-progress-value", progress === null ? "Not available" : `${progress}%`);
  const bar = document.getElementById("project-progress-bar");
  bar.style.width = `${progress ?? 0}%`;
  bar.parentElement.setAttribute("aria-valuenow", String(progress ?? 0));

  document.getElementById("project-risks").innerHTML = `
    <div class="d-flex justify-content-between mb-2"><span>Time risk</span>${riskBadge(p.timeRisk)}</div>
    <div class="d-flex justify-content-between mb-3"><span>Cost risk</span>${riskBadge(p.costRisk)}</div>
    <div class="small text-secondary mb-1">Combined risk (higher of the two)</div>
    ${combinedRiskCell(p.combinedRisk)}`;

  document.getElementById("project-content").hidden = false;
}

/* ---- Cookies (review votes + anonymous client ID) ---- */

function getCookie(name) {
  const prefix = `${name}=`;
  const match = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice(prefix.length));
  } catch {
    return null;
  }
}

function setCookie(name, value, maxAgeDays = CONFIG.COOKIE_MAX_AGE_DAYS) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeDays * 86400}; Path=/; SameSite=Lax${secure}`;
}

function deleteCookie(name) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

// Anonymous ID for this browser; the backend uses it to allow one vote per project
function getClientId() {
  let id = getCookie(CONFIG.CLIENT_ID_COOKIE);
  if (!id) {
    id = window.crypto?.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
  setCookie(CONFIG.CLIENT_ID_COOKIE, id); // refreshes the expiry on every visit
  return id;
}

// Votes cookie format: "<projectId>:u|<projectId>:d" (oldest first)
const VOTE_TO_CODE = { up: "u", down: "d" };
const CODE_TO_VOTE = { u: "up", d: "down" };
const MAX_VOTES_COOKIE_LENGTH = 3800; // browsers cap a cookie at about 4 KB

function getStoredVotes() {
  const votes = new Map();
  const raw = getCookie(CONFIG.VOTES_COOKIE);
  if (!raw) return votes;
  raw.split("|").forEach((entry) => {
    const sep = entry.lastIndexOf(":");
    const vote = CODE_TO_VOTE[entry.slice(sep + 1)];
    if (sep > 0 && vote) {
      try {
        votes.set(decodeURIComponent(entry.slice(0, sep)), vote);
      } catch {
        /* skip malformed entry */
      }
    }
  });
  return votes;
}

function storeVote(projectId, vote) {
  const votes = getStoredVotes();
  votes.delete(projectId);               // re-adding moves it to the end (newest)
  if (vote) votes.set(projectId, vote);

  const entries = [...votes].map(([id, v]) => `${encodeURIComponent(id)}:${VOTE_TO_CODE[v]}`);
  // If the cookie gets too big, forget the oldest votes first
  while (entries.length && encodeURIComponent(entries.join("|")).length > MAX_VOTES_COOKIE_LENGTH) {
    entries.shift();
  }

  if (entries.length) setCookie(CONFIG.VOTES_COOKIE, entries.join("|"));
  else deleteCookie(CONFIG.VOTES_COOKIE);
}

// Same button again = back to neutral; the other button = switch to it
function nextVote(current, clicked) {
  return current === clicked ? null : clicked;
}

// Voted = solid button, not voted = outline button
const VOTE_CLASSES = {
  up:   { on: "btn-success", off: "btn-outline-success" },
  down: { on: "btn-danger",  off: "btn-outline-danger" },
};

function initReviews(project) {
  const buttons = document.querySelectorAll("[data-vote]");
  let counts = project.reviews;
  // TODO(backend): if GET /projects/{id} returns "my_vote" for this client_id, prefer it over the cookie
  let myVote = getStoredVotes().get(project.id) ?? null;

  const render = () => {
    setText("review-up-count", formatNumber(counts.up));
    setText("review-down-count", formatNumber(counts.down));
    buttons.forEach((button) => {
      const classes = VOTE_CLASSES[button.dataset.vote];
      const selected = button.dataset.vote === myVote;
      button.classList.toggle(classes.on, selected);
      button.classList.toggle(classes.off, !selected);
      button.classList.remove("active"); // no longer used for this state
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  render();

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const newVote = nextVote(myVote, button.dataset.vote);

      buttons.forEach((b) => { b.disabled = true; });
      try {
        counts = await api.submitReview(project.id, newVote, getClientId());
        myVote = newVote;
        storeVote(project.id, newVote);
        render();
        setText("review-message", newVote ? "Your review has been saved." : "Your review has been removed.");
      } catch (error) {
        console.error("Failed to save review:", error);
        setText("review-message", "Couldn't save your review. Try again.");
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
      }
    });
  });
}

async function runAnalysis(projectId) {
  const button = document.getElementById("analyse-button");
  const body = document.getElementById("analysis-body");
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById("analysis-modal"));

  button.disabled = true;
  body.innerHTML = loadingHTML("Analysing the project. This can take up to a minute.");
  modal.show();

  try {
    const analysis = await api.analyseProject(projectId);
    body.innerHTML = analysisHTML(analysis);
  } catch (error) {
    console.error("Analysis failed:", error);
    const text = error.status === 408
      ? "The analysis took too long. Try again."
      : "Couldn't run the analysis. Try again later.";
    body.innerHTML = `<div class="alert alert-danger mb-0">${text}</div>`;
  } finally {
    button.disabled = false;
  }
}

// All LLM output is escaped before display
function analysisHTML(a) {
  const hasContent = a.summary || a.keyFindings.length || a.riskFactors.length ||
    a.recommendations.length || Object.keys(a.extra).length;
  if (!hasContent) return `<p class="text-secondary mb-0">The analysis returned no data.</p>`;

  const level = RISK_STYLES[String(a.riskLevel ?? "").toLowerCase()];
  const meta = [
    level ? `<span>Risk level <span class="badge ${level.badge}">${level.label}</span></span>` : "",
    Number.isFinite(a.confidence) ? `<span>Confidence ${formatPercent(a.confidence)}</span>` : "",
    a.generatedAt ? `<span>Generated ${formatDateTime(a.generatedAt)}</span>` : "",
  ].filter(Boolean).join("");

  return `
    ${meta ? `<div class="d-flex flex-wrap gap-3 small text-secondary mb-3">${meta}</div>` : ""}
    ${a.summary ? `<h3 class="h6">Summary</h3><p>${escapeHTML(a.summary)}</p>` : ""}
    ${listSection("Key findings", a.keyFindings)}
    ${riskFactorsSection(a.riskFactors)}
    ${listSection("Recommendations", a.recommendations)}
    ${Object.keys(a.extra).length ? `<h3 class="h6 mt-4">Other details</h3>${renderJSONValue(a.extra)}` : ""}`;
}

function listSection(title, items) {
  if (!items.length) return "";
  return `
    <h3 class="h6 mt-4">${escapeHTML(title)}</h3>
    <ul class="mb-0">${items.map((item) => `<li>${renderJSONValue(item)}</li>`).join("")}</ul>`;
}

function riskFactorsSection(factors) {
  if (!factors.length) return "";
  const rows = factors.map((f) => {
    if (typeof f !== "object" || f === null) return `<tr><td colspan="3">${escapeHTML(f)}</td></tr>`;
    const style = RISK_STYLES[String(f.impact ?? "").toLowerCase()];
    const impact = style
      ? `<span class="badge ${style.badge}">${style.label}</span>`
      : escapeHTML(f.impact ?? "");
    return `<tr><td>${escapeHTML(f.factor ?? "")}</td><td>${impact}</td><td>${escapeHTML(f.detail ?? "")}</td></tr>`;
  }).join("");
  return `
    <h3 class="h6 mt-4">Risk factors</h3>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead><tr><th scope="col">Factor</th><th scope="col">Impact</th><th scope="col">Detail</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ===================== 11. ADMIN LOGIN (login.html) ===================== */

function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  const message = document.getElementById("login-message");
  const showMessage = (type, text) => {
    message.className = `alert alert-${type}`;
    message.textContent = text;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
      const session = await api.login(form.elements.username.value.trim(), form.elements.password.value);
      if (session.role !== CONFIG.ADMIN_ROLE) {
        clearSession();
        showMessage("danger", "This login is only for administrators. Citizens can view all project information without logging in.");
        return;
      }
      saveSession(session);
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
    }
  });
}

/* ===================== 12. UPLOAD PROJECTS, ADMIN ONLY (upload.html) ===================== */

// TODO(backend): match these field names to what the upload endpoint expects
function buildProjectPayload(form) {
  return new FormData(form); // document, start_month, expected_end_month
}

const MAX_PDF_BYTES = 20 * 1024 * 1024; // TODO(backend): match the server's limit
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function initUpload() {
  const form = document.getElementById("upload-form");
  if (!form) return;

  // Cosmetic guard only: the backend must reject non-admin uploads
  if (!isAdmin()) {
    window.location.replace("login.html?next=upload.html");
    return;
  }
  document.getElementById("upload-content").hidden = false;

  const document_ = form.elements.namedItem("document");
  const start = form.elements.namedItem("start_month");
  const end = form.elements.namedItem("expected_end_month");

  const checkFile = () => {
    const file = document_.files?.[0];
    let error = "";
    if (file) {
      const isPDF = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      if (!isPDF) error = "The file must be a PDF.";
      else if (file.size > MAX_PDF_BYTES) error = "The file must be 20 MB or smaller.";
    }
    document_.setCustomValidity(error);
  };

  // type="month" falls back to a text box in some browsers, so check the format here too
  const checkMonths = () => {
    const badStart = start.value && !MONTH_PATTERN.test(start.value);
    start.setCustomValidity(badStart ? "Use the format YYYY-MM." : "");

    let endError = "";
    if (end.value && !MONTH_PATTERN.test(end.value)) endError = "Use the format YYYY-MM.";
    else if (start.value && end.value && end.value <= start.value) {
      endError = "The completion month must be after the start month.";
    }
    end.setCustomValidity(endError);
  };

  document_.addEventListener("change", checkFile);
  start.addEventListener("change", checkMonths);
  end.addEventListener("change", checkMonths);
  form.addEventListener("reset", () => {
    form.classList.remove("was-validated");
    [document_, start, end].forEach((field) => field.setCustomValidity(""));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    checkFile();
    checkMonths();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }

    const message = document.getElementById("upload-message");
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    try {
      const { id } = await api.uploadProject(buildProjectPayload(form));
      message.className = "alert alert-success mt-4";
      message.innerHTML = `Project uploaded with ID ${escapeHTML(id)}.
        <a href="project.html?id=${encodeURIComponent(id)}" class="alert-link">View project</a>`;
      form.reset();
      form.classList.remove("was-validated");
    } catch (error) {
      console.error("Upload failed:", error);
      message.className = "alert alert-danger mt-4";
      if (error.status === 401 || error.status === 403) {
        message.innerHTML = `Your admin session has expired.
          <a href="login.html?next=upload.html" class="alert-link">Log in again</a>`;
      } else if (error.status === 413) {
        message.textContent = "The file is too large for the server.";
      } else {
        message.textContent = "Couldn't upload the project. Check the file and try again.";
      }
    } finally {
      button.disabled = false;
    }
  });
}

/* ===================== 13. START ===================== */

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initSummary();
  initProjects();
  initPreview();
  initProjectPage();
  initLogin();
  initUpload();
});