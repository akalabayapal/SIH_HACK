/**
 * Kab Tak – Historical Trends Visualization Script
 */

"use strict";

let progressChartInstance = null;
let costChartInstance = null;

/**
 * Clean exported function to accept historical project report data and render line graphs.
 * @param {Array<Object>} reportsData - Array of objects matching project schema.
 */
function renderProjectTrends(reportsData) {
  if (!Array.isArray(reportsData) || reportsData.length === 0) return;

  // Sort chronologically by report_date
  const sortedReports = [...reportsData].sort((a, b) => new Date(a.report_date) - new Date(b.report_date));

  // Extract axis data
  const labels = sortedReports.map((item) => {
    if (!item.report_date) return "";
    const dateObj = new Date(item.report_date);
    return dateObj.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  });

  const progressValues = sortedReports.map((item) => item.progress ?? 0);
  const costValues = sortedReports.map((item) => item.cost_spent ?? 0);

  // 1. Draw Progress vs Report Date Line Graph
  const progressCanvas = document.getElementById("chart-progress-trend");
  if (progressCanvas) {
    if (progressChartInstance) progressChartInstance.destroy();

    progressChartInstance = new Chart(progressCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Progress (%)",
          data: progressValues,
          borderColor: "#138808",
          backgroundColor: "rgba(19, 136, 8, 0.12)",
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: "#138808",
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` Progress: ${context.parsed.y}%`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: "Progress (%)" },
            ticks: { callback: (v) => `${v}%` }
          },
          x: {
            title: { display: true, text: "Report Date" }
          }
        }
      }
    });
  }

  // 2. Draw Cost vs Report Date Line Graph
  const costCanvas = document.getElementById("chart-cost-trend");
  if (costCanvas) {
    if (costChartInstance) costChartInstance.destroy();

    costChartInstance = new Chart(costCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Cost Spent (₹ Cr)",
          data: costValues,
          borderColor: "#1d5fa8",
          backgroundColor: "rgba(29, 95, 168, 0.12)",
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          pointBackgroundColor: "#1d5fa8",
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` Cost Spent: ₹${context.parsed.y} Cr`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Cost Spent (₹ Cr)" },
            ticks: { callback: (v) => `₹${v}` }
          },
          x: {
            title: { display: true, text: "Report Date" }
          }
        }
      }
    });
  }
}

