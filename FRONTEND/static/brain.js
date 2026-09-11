/* =========================================================================
   Kab Tak – brain.js
   Shared script for all pages. Each feature only runs if its elements
   exist on the current page.

   BACKEND CONTRACT (proposed – confirm with backend teammate)
   -------------------------------------------------------------------------
   All risk scores are numbers from 0 to 1 (0 = no risk, 1 = maximum risk).

   1) GET  {API_BASE_URL}/summary
      Response: { "total": 200, "predicted": 137, "tbtp": 28, "tytp": 35 }

   2) GET  {API_BASE_URL}/projects?page=1&limit=20&sort=combined_risk_asc
      Only predicted projects (no TBTP / TYTP).
      MUST be sorted on the server by combined_risk ascending, where
      combined_risk = max(time_risk, cost_risk)
      Response: {
        "items": [
          { "id": "PRJ-0001", "name": "...", "agency": "...", "state": "...",
            "time_risk": 0.12, "cost_risk": 0.20, "combined_risk": 0.16 }
        ],
        "page": 1, "limit": 20, "total": 137, "has_more": true
      }

   3) GET  {API_BASE_URL}/projects/{id}/preview
      Response: {
        "id": "PRJ-0001", "name": "...", "agency": "...", "state": "...",
        "description": "...", "start_date": "2021-04-01",
        "expected_end": "2025-03-31", "sanctioned_cost_cr": 450.5,
        "expenditure_cr": 210.0, "physical_progress_pct": 46,
        "time_risk": 0.12, "cost_risk": 0.20, "combined_risk": 0.16,
        "last_updated": "2026-09-01"
      }

   4) POST {API_BASE_URL}/auth/login
      Body:     { "username": "...", "password": "..." }
      Response: { "token": "..." }

   If the backend uses different field names, change ONLY the adapt*
   functions in section 3. To go live: set USE_MOCK_DATA to false and
   set API_BASE_URL.
   ========================================================================= */

"use strict";

/* ===================== 1. CONFIG ===================== */

const CONFIG = {
  USE_MOCK_DATA: true,                        // TODO(backend): set to false when the API is ready
  API_BASE_URL: "http://localhost:8000/api",  // TODO(backend): teammate's server URL
  ENDPOINTS: {
    SUMMARY: "/summary",
    PROJECTS: "/projects",
    PROJECT_PREVIEW: (id) => `/projects/${encodeURIComponent(id)}/preview`,
    LOGIN: "/auth/login",
  },
  PAGE_SIZE: 20,
  PREVIEW_DELAY_MS: 1000,
  // TODO(ML): replace with the thresholds the ML model actually uses
  RISK_THRESHOLDS: { LOW_MAX: 0.33, MEDIUM_MAX: 0.66 },
  AUTH_TOKEN_KEY: "kabtak_token",
};

/* ===================== 2. HELPERS ===================== */

function escapeHTML(value) {
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}

function toNumber(value) {
  return value === null || value === undefined || value === "" ? NaN : Number(value);
}

function formatNumber(n) {
  return Number.isFinite(n) ? new Intl.NumberFormat("en-IN").format(n) : "–";
}

function formatPercent(fraction) {
  return Number.isFinite(fraction) ? `${Math.round(fraction * 100)}%` : "N/A";
}

function formatCrore(value) {
  if (!Number.isFinite(value)) return "Not available";
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value)} cr`;
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
  if (risk <= CONFIG.RISK_THRESHOLDS.LOW_MAX) return "low";
  if (risk <= CONFIG.RISK_THRESHOLDS.MEDIUM_MAX) return "medium";
  return "high";
}

function riskBadge(risk) {
  if (!Number.isFinite(risk)) return `<span class="badge text-bg-secondary">N/A</span>`;
  const style = RISK_STYLES[riskLevel(risk)];
  return `<span class="badge ${style.badge}">${formatPercent(risk)}<span class="visually-hidden">, ${style.label} risk</span></span>`;
}

function combinedRiskCell(risk) {
  if (!Number.isFinite(risk)) return riskBadge(risk);
  const style = RISK_STYLES[riskLevel(risk)];
  const pct = Math.max(0, Math.min(100, Math.round(risk * 100)));
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

/* ===================== 3. ADAPTERS (backend JSON -> UI objects) ===================== */
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
    combinedRisk: Number.isFinite(combined) ? combined : (timeRisk + costRisk) / 2,
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

/* ===================== 4. MOCK DATA (delete once the backend is live) ===================== */

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
    };
  });

  const sortedByRisk = [...projects].sort((a, b) => a.combined_risk - b.combined_risk);

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
      if (!project) throw new Error(`Project ${id} not found`);
      return project;
    },
    async login(username, password) {
      await delay(400);
      if (!username || !password) throw new Error("Missing credentials");
      return { token: "mock-token" }; // mock accepts any non-empty credentials
    },
  };
})();

/* ===================== 5. API LAYER ===================== */

function getAuthHeader() {
  // TODO(backend): agree on token handling (httpOnly cookie is safer than sessionStorage)
  const token = sessionStorage.getItem(CONFIG.AUTH_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(path, { method = "GET", body } = {}) {
  const headers = { ...getAuthHeader() };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`${method} ${path} failed with status ${response.status}`);
  }
  return response.json();
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

  async login(username, password) {
    const raw = CONFIG.USE_MOCK_DATA
      ? await mock.login(username, password)
      : await apiRequest(CONFIG.ENDPOINTS.LOGIN, { method: "POST", body: { username, password } });
    return { token: raw.token };
  },
};

/* ===================== 6. PREDICTION SUMMARY + PIE CHART ===================== */

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

/* ===================== 7. RANKED PROJECT LIST (lazy loading) ===================== */

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
  li.tabIndex = 0;
  li.dataset.projectId = project.id;
  li.innerHTML = `
    <div class="row g-2 align-items-center">
      <div class="col-2 col-md-1 kt-rank fw-semibold text-secondary">#${rank}</div>
      <div class="col-10 col-md-5">
        <div class="fw-semibold">${escapeHTML(project.name)}</div>
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
  setText("projects-counter", `Showing ${formatNumber(projectsState.loaded)} of ${formatNumber(projectsState.total)} projects`);
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

/* ===================== 8. HOVER PREVIEW (1 s delay) ===================== */

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
  element.addEventListener("focus", start);
  element.addEventListener("mouseleave", cancelPreview);
  element.addEventListener("blur", cancelPreview);
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

  box.innerHTML = `
    <div class="card-body small d-flex align-items-center gap-2">
      <span class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></span>
      Loading preview…
    </div>`;
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
  const progress = Number.isFinite(p.progressPct) ? Math.max(0, Math.min(100, p.progressPct)) : null;
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

/* ===================== 9. LOGIN ===================== */

function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.classList.add("was-validated");
      return;
    }

    const message = document.getElementById("login-message");
    const button = form.querySelector('button[type="submit"]');
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;

    button.disabled = true;
    try {
      const { token } = await api.login(username, password);
      sessionStorage.setItem(CONFIG.AUTH_TOKEN_KEY, token);
      message.className = "alert alert-success";
      message.textContent = "Logged in. Redirecting…";
      setTimeout(() => { window.location.href = "index.html"; }, 800);
    } catch (error) {
      console.error("Login failed:", error);
      message.className = "alert alert-danger";
      message.textContent = "Login failed. Check your username and password.";
    } finally {
      button.disabled = false;
    }
  });
}

/* ===================== 10. START ===================== */

document.addEventListener("DOMContentLoaded", () => {
  initSummary();
  initProjects();
  initPreview();
  initLogin();
});