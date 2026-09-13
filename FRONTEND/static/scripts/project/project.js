/* =========================================================================
   Project Details, Reviews, and LLM Analysis Module
   Target: project_2.html
========================================================================= */

// 1. Initialization
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

// 2. UI Rendering Error
function showProjectPageError(title, text) {
  setText("project-title", title);
  const alert = document.getElementById("project-error");
  alert.textContent = text;
  alert.hidden = false;
}


// Render the content of the page
function renderProjectPage(p) {
  document.title = `${p.name} | Kab Tak`;
  setText("project-title", p.agency);
  setText("project-id-label", `Project ID ${p.id}`);
  setText("project-description", p.name || "No description available.");

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

// Boot up when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initProjectPage();
});