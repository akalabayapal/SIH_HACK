/* =========================================================================
   Kab Tak – index.js
   Landing page module: summary statistics, pie chart, project list, hover preview.
   ========================================================================= */

"use strict";

/* ===================== 1. PREDICTION SUMMARY & PIE CHART ===================== */

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

/* ===================== 2. RANKED PROJECT LIST (LAZY LOADED) ===================== */

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
  document.getElementById("projects-retry")?.addEventListener("click", () => {
    status.innerHTML = "";
    loadNextProjectsPage();
  });
}

/* ===================== 3. HOVER PREVIEW (1 SECOND DELAY) ===================== */

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

/* ===================== 4. INITIALIZATION ===================== */

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  initSummary();
  initProjects();
  initPreview();
});