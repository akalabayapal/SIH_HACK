/* =========================================================================
   Kab Tak – brain.js
   Shared script for all pages. Each feature only runs if its elements
   exist on the current page.

   BACKEND CONTRACT
   -------------------------------------------------------------------------
   Risk scores are numbers from 0 to 1 or 0 to 100. combined_risk = max(time_risk, cost_risk).
   Protected endpoints expect the header:  Authorization: Bearer <token>

   1) GET  /summary
      -> { "total": 200, "predicted": 137, "tbtp": 28, "tytp": 35 }

   2) GET  /projects?page=1&limit=20
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

   5) GET /adjust_vote/{code}?op={0|1|2|3}
      op=0 (inc upvote), op=1 (dec upvote), op=2 (inc downvote), op=3 (dec downvote)

   6) GET /get_votes/{id}
      -> { "up": 12, "down": 3 }

   7) POST /projects/{id}/analyse                     (LLM analysis)
      -> { "project_id", "generated_at": "2026-09-11T10:30:00Z",
           "summary": "...", "risk_level": "low" | "medium" | "high",
           "confidence": 0.78,
           "key_findings": ["..."],
           "risk_factors": [ { "factor", "impact", "detail" } ],
           "recommendations": ["..."] }
      Any extra keys are shown under "Other details".

   8) POST /auth/login
      body { "username", "password" }
      -> returns { "status": 0 } if login is OK, else false / { "status": -1 }
      The frontend requires role "admin" for administrative features.

   9) POST /projects                                   (admin only)
      Content-Type: multipart/form-data
      fields: document (PDF file), start_month "YYYY-MM",
              expected_end_month "YYYY-MM"
      -> { "id": "PRJ-0201" }
   ========================================================================= */

"use strict";

/* ===================== 1. CONFIG ===================== */

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
  if (str.length > maxLength) {
    return str.slice(0, maxLength) + "...";
  }
  return str;
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

function humanizeKey(key) {
  const text = String(key).replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
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

function safeNextPage(value) {
  return /^[a-z0-9-]+\.html$/i.test(value ?? "") ? value : "index.html";
}

/* ===================== 3. SESSION + NAVBAR ===================== */

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

/* ===================== 4. ADAPTERS (backend JSON <-> UI objects) ===================== */

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
  if (history.state) {
    state = capitalizeWords(history.state);
  }

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

function adaptReviewCounts(raw) {
  return {
    up: toNumber(raw?.up ?? raw?.upvotes ?? raw?.up_votes) || 0,
    down: toNumber(raw?.down ?? raw?.downvotes ?? raw?.down_votes) || 0,
  };
}

function adaptProjectDetail(raw) {
  return { ...adaptPreview(raw), reviews: adaptReviewCounts(raw?.reviews) };
}

/* ===================== LLM ANALYSIS RENDERING ===================== */

const ANALYSIS_KNOWN_KEYS = [
  "project_id", "generated_at", "summary", "risk_level",
  "confidence", "key_findings", "risk_factors", "recommendations",
  "content", "status"
];

function adaptAnalysis(raw) {
  if (!raw) return { summary: "", keyFindings: [], riskFactors: [], recommendations: [], extra: {} };

  if (raw.status === -1 || raw.reason) {
    return {
      summary: raw.reason || "Analysis failed on the server.",
      keyFindings: [],
      riskFactors: [],
      recommendations: [],
      extra: {}
    };
  }

  const data = raw.content && typeof raw.content === "object" ? raw.content : raw;
  const summary = data.summary || data.risk_summary || raw.summary || "";

  let keyFindings = [];
  if (Array.isArray(data.key_findings)) {
    keyFindings = data.key_findings;
  } else if (Array.isArray(raw.key_findings)) {
    keyFindings = raw.key_findings;
  } else if (data.evidence_behind_the_risk) {
    keyFindings = [data.evidence_behind_the_risk];
  }

  let recommendations = [];
  if (Array.isArray(data.recommendations)) {
    recommendations = data.recommendations;
  } else if (Array.isArray(raw.recommendations)) {
    recommendations = raw.recommendations;
  } else if (Array.isArray(data.possible_on_ground_explanations)) {
    recommendations = data.possible_on_ground_explanations;
  } else if (data.possible_on_ground_explanations) {
    recommendations = [data.possible_on_ground_explanations];
  }

  const extra = Object.fromEntries(
    Object.entries(data ?? {}).filter(([key]) => {
      const k = key.toLowerCase();
      return !ANALYSIS_KNOWN_KEYS.includes(k);
    })
  );

  return {
    projectId: raw.project_id || data.project_id,
    generatedAt: raw.generated_at || data.generated_at,
    summary,
    riskLevel: raw.risk_level || data.risk_level,
    confidence: toNumber(raw.confidence ?? data.confidence),
    keyFindings,
    riskFactors: Array.isArray(data.risk_factors) ? data.risk_factors : (Array.isArray(raw.risk_factors) ? raw.risk_factors : []),
    recommendations,
    extra,
  };
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
      <div class="d-flex flex-wrap align-items-center gap-2 mb-4 p-3 bg-white rounded-3 shadow-sm border">
        ${riskBadgeHtml}
        ${confidenceHtml}
        ${timeHtml}
      </div>

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

function listSection(title, items, accentClass = "border-primary text-primary") {
  if (!items.length) return "";
  return `
    <div class="card border-0 shadow-sm mb-4 border-start border-4 ${accentClass.split(' ')[0]}">
      <div class="card-body">
        <h3 class="h6 fw-bold mb-3 ${accentClass.split(' ')[1] || 'text-dark'}">${escapeHTML(title)}</h3>
        <ul class="list-group list-group-flush">
          ${items.map((item) => `
            <li class="list-group-item bg-transparent border-0 px-0 py-1 text-dark small d-flex gap-2">
              <span class="fw-bold">•</span>
              <div>${renderJSONValue(item)}</div>
            </li>`).join("")}
        </ul>
      </div>
    </div>`;
}

function riskFactorsSection(factors) {
  if (!factors.length) return "";
  const rows = factors.map((f) => {
    if (typeof f !== "object" || f === null) return `<tr><td colspan="3">${escapeHTML(f)}</td></tr>`;
    const style = RISK_STYLES[String(f.impact ?? "").toLowerCase()];
    const impact = style
      ? `<span class="badge ${style.badge} shadow-sm">${style.label}</span>`
      : escapeHTML(f.impact ?? "");
    return `
      <tr>
        <td class="fw-semibold text-dark">${escapeHTML(f.factor ?? "")}</td>
        <td>${impact}</td>
        <td class="text-secondary small">${escapeHTML(f.detail ?? "")}</td>
      </tr>`;
  }).join("");

  return `
    <div class="card border-0 shadow-sm mb-4 overflow-hidden">
      <div class="p-3 bg-white border-bottom">
        <h3 class="h6 fw-bold text-danger mb-0">Risk Factors</h3>
      </div>
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light text-secondary small">
            <tr>
              <th scope="col" style="width: 25%;">Factor</th>
              <th scope="col" style="width: 20%;">Impact</th>
              <th scope="col" style="width: 55%;">Detail</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function renderExtraDetails(extra) {
  const entries = Object.entries(extra);
  if (!entries.length) return "";

  const cardsHtml = entries.map(([key, value]) => {
    const lowerKey = key.toLowerCase();
    let borderAccent = "border-primary";
    let titleColor = "text-primary";

    if (lowerKey.includes("cost") || lowerKey.includes("budget") || lowerKey.includes("financial")) {
      borderAccent = "border-danger";
      titleColor = "text-danger";
    } else if (lowerKey.includes("time") || lowerKey.includes("schedule") || lowerKey.includes("delay")) {
      borderAccent = "border-warning";
      titleColor = "text-warning-emphasis";
    } else if (lowerKey.includes("evidence") || lowerKey.includes("proof")) {
      borderAccent = "border-info";
      titleColor = "text-info";
    }

    return `
      <div class="card mb-3 border-0 shadow-sm border-start border-4 ${borderAccent}">
        <div class="card-body">
          <h4 class="h6 fw-bold mb-2 ${titleColor}">${escapeHTML(humanizeKey(key))}</h4>
          <div class="text-dark small lh-base">
            ${typeof value === "object" ? renderJSONValue(value) : escapeHTML(String(value))}
          </div>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="mt-4">
      <h3 class="h6 fw-bold text-dark mb-3">Detailed Assessment Breakdown</h3>
      ${cardsHtml}
    </div>`;
}

/**
 * Handles backend login response.
 * If raw is { status: 0 }, login succeeded -> returns session object.
 * If raw is false / { status: -1 }, login failed -> returns null.
 */
function adaptLogin(raw, username = "admin") {
  console.log("Raw Login Data:", raw);
  if (raw && typeof raw === "object" && raw.status === 0) {
    return {
      token: raw.token || "admin-session-token",
      role: raw.role || CONFIG.ADMIN_ROLE,
      name: raw.name || capitalizeWords(username) || "Administrator",
    };
  }
  return null;
}

/* ===================== 5. MOCK DATA ===================== */

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

  const votes = new Map();

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
      const key = `${id}:${getClientId()}`;
      const saved = getStoredVotes().get(id);
      if (saved && !votes.has(key)) {
        project.reviews[saved] += 1;
        votes.set(key, saved);
      }
      return { ...project, reviews: { ...project.reviews } };
    },

    async getVotes(id) {
      await delay(300);
      const project = findProject(id);
      return { ...project.reviews };
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
        model: "mock-llm",
      };
    },

    async login(username, password) {
      await delay(400);
      if (username === "admin" && password === "admin123") {
        return { status: 0, token: "mock-admin-token", role: "admin", name: "Administrator" };
      }
      return false;
    },

    async uploadProject(payload) {
      await delay(600);
      if (!isAdmin()) throw httpError(403, "Admin only");
      const id = `PRJ-${String(projects.length + 1).padStart(4, "0")}`;
      const file = payload.get("document");
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

/* ===================== 7. PREDICTION SUMMARY + PIE CHART (index.html) ===================== */

const COVERAGE_KEYS = [
  { key: "predicted", label: "Predicted", cssVar: "--kt-predicted" },
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
      projectsObserver.observe(sentinel);
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
  let dept = project.agency;
  let name = project.name;

  if (typeof project.name === "string" && project.name.includes("___")) {
    const parts = project.name.split("___");
    dept = truncateText(parts[0], 50);
    name = truncateText(parts[1], 50);
  } else {
    dept = truncateText(dept, 50);
    name = truncateText(name, 50);
  }

  const li = document.createElement("li");
  li.className = "list-group-item kt-project-item";
  li.dataset.projectId = project.id;
  li.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-2 col-md-1 kt-rank fw-semibold text-secondary">${project.id}</div>
      <div class="col-10 col-md-5">
        <a href="project.html?id=${encodeURIComponent(project.id)}"
           class="fw-semibold text-body text-decoration-none stretched-link">${escapeHTML(capitalizeWords(name))}</a>
        <div class="small text-secondary">${escapeHTML(capitalizeWords(dept))} | ${escapeHTML(capitalizeWords(project.state))}</div>
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
    if (previewState.activeId !== projectId) return;
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
    await initReviews(project);
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

const VOTE_TO_CODE = { up: "u", down: "d" };
const CODE_TO_VOTE = { u: "up", d: "down" };
const MAX_VOTES_COOKIE_LENGTH = 3800;

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
  votes.delete(projectId);
  if (vote) votes.set(projectId, vote);

  const entries = [...votes].map(([id, v]) => `${encodeURIComponent(id)}:${VOTE_TO_CODE[v]}`);
  while (entries.length && encodeURIComponent(entries.join("|")).length > MAX_VOTES_COOKIE_LENGTH) {
    entries.shift();
  }

  if (entries.length) setCookie(CONFIG.VOTES_COOKIE, entries.join("|"));
  else deleteCookie(CONFIG.VOTES_COOKIE);
}

function nextVote(current, clicked) {
  return current === clicked ? null : clicked;
}

const VOTE_CLASSES = {
  up:   { on: "btn-success", off: "btn-outline-success" },
  down: { on: "btn-danger",  off: "btn-outline-danger" },
};

async function initReviews(project) {
  const buttons = document.querySelectorAll("[data-vote]");
  let counts = project.reviews || { up: 0, down: 0 };
  let myVote = getStoredVotes().get(project.id) ?? null;

  try {
    const freshVotes = await api.getVotes(project.id);
    if (freshVotes) counts = freshVotes;
  } catch (error) {
    console.warn("Could not fetch fresh votes, defaulting to project details:", error);
  }

  const render = () => {
    setText("review-up-count", formatNumber(counts.up));
    setText("review-down-count", formatNumber(counts.down));
    buttons.forEach((button) => {
      const classes = VOTE_CLASSES[button.dataset.vote];
      const selected = button.dataset.vote === myVote;
      button.classList.toggle(classes.on, selected);
      button.classList.toggle(classes.off, !selected);
      button.classList.remove("active");
      button.setAttribute("aria-pressed", String(selected));
    });
  };
  render();

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const newVote = nextVote(myVote, button.dataset.vote);

      buttons.forEach((b) => { b.disabled = true; });
      try {
        counts = await api.submitReview(project.id, myVote, newVote, counts);
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
  
      if (!session) {
        clearSession();
        showMessage("danger", "This login is only for administrators. Citizens can view all project information without logging in.");
        return;
      }
      saveSession(session);
      initNav(); // Refresh navbar visibility with active admin session
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

function buildProjectPayload(form) {
  return new FormData(form);
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function initUpload() {
  const form = document.getElementById("upload-form");
  if (!form) return;

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
  
  form.addEventListener("reset", () => {
    form.classList.remove("was-validated");
    [document_, start, end].forEach((field) => field.setCustomValidity(""));
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