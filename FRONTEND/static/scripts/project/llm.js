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