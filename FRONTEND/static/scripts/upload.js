/**
 * Kab Tak – upload.js
 * Workflow aligned with Flask Backend (app.py):
 * 1. POST file, month, year to http://localhost:3000/upload_file
 * 2. POST returned filepath to http://localhost:3000/retrain_model
 * 3. Poll http://localhost:3000/get_training_status/<uid> every 30s (returns boolean true/false)
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "http://localhost:3000";
  const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB max file size
  const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
  const POLL_INTERVAL_MS = 30000; // 30 seconds

  let pollingTimer = null;

  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem("kabtak_session"));
    } catch {
      return null;
    }
  }

  function isAdmin() {
    return getSession()?.role === "admin";
  }

  function getAuthHeader() {
    const token = getSession()?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function initUpload() {
    const form = document.getElementById("upload-form");
    if (!form) return;

    // Admin authorization guard
    if (!isAdmin()) {
      window.location.replace("login.html?next=uploads.html");
      return;
    }

    const uploadContent = document.getElementById("upload-content");
    if (uploadContent) uploadContent.hidden = false;

    const docInput = form.elements.namedItem("document");
    const monthInput = form.elements.namedItem("reporting_month");
    const submitBtn = form.querySelector('button[type="submit"]');
    const alertBox = document.getElementById("upload-alert");

    const showAlert = (type, message, showSpinner = false) => {
      if (!alertBox) return;
      alertBox.className = `alert alert-${type} shadow-sm border-0 mb-4 d-flex align-items-center gap-2`;
      
      const spinnerHtml = showSpinner 
        ? `<div class="spinner-border spinner-border-sm text-${type}" role="status"><span class="visually-hidden">Loading...</span></div>` 
        : '';
      
      alertBox.innerHTML = `${spinnerHtml}<div>${message}</div>`;
      alertBox.hidden = false;
    };

    const hideAlert = () => {
      if (alertBox) alertBox.hidden = true;
    };

    // Client-side validations
    const checkFile = () => {
      const file = docInput?.files?.[0];
      let error = "";
      if (!file) {
        error = "Please select a PDF file.";
      } else {
        const isPDF = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        if (!isPDF) {
          error = "The uploaded file must be a PDF document.";
        } else if (file.size > MAX_PDF_BYTES) {
          error = "The file size must not exceed 20 MB.";
        }
      }
      if (docInput) docInput.setCustomValidity(error);
      return !error;
    };

    const checkMonth = () => {
      let error = "";
      if (!monthInput?.value || !MONTH_PATTERN.test(monthInput.value)) {
        error = "Please select a valid reporting month (YYYY-MM).";
      }
      if (monthInput) monthInput.setCustomValidity(error);
      return !error;
    };

    if (docInput) docInput.addEventListener("change", checkFile);
    if (monthInput) monthInput.addEventListener("change", checkMonth);

    // STEP 3: Poll training status endpoint every 30 seconds
    const startStatusPolling = (jobId) => {
      let checkCount = 0;

      const checkStatus = async () => {
        checkCount++;
        const now = new Date().toLocaleTimeString();
        
        showAlert(
          "info",
          `<strong>Retraining Model...</strong> (Job ID: <code>${jobId}</code>)<br>` +
          `<small class="text-muted">Status check #${checkCount} at ${now}. Polling every 30s...</small>`,
          true
        );

        try {
          const res = await fetch(`${API_BASE}/get_training_status/${encodeURIComponent(jobId)}`, {
            headers: getAuthHeader(),
          });

          if (!res.ok) {
            throw new Error(`Failed to check job status (HTTP ${res.status})`);
          }

          // Backend returns boolean: true = completed, false = running
          const isCompleted = await res.json();

          if (isCompleted === true) {
            clearInterval(pollingTimer);
            showAlert("success", `<strong>Success!</strong> Model retraining complete for Job ID: <code>${jobId}</code>.`);
            if (submitBtn) submitBtn.disabled = false;
            form.reset();
            form.classList.remove("was-validated");
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      // Check immediately, then every 30s
      checkStatus();
      pollingTimer = setInterval(checkStatus, POLL_INTERVAL_MS);
    };

    // Form Submit Execution
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();
      if (pollingTimer) clearInterval(pollingTimer);

      if (!form.checkValidity() || !checkFile() || !checkMonth()) {
        e.stopPropagation();
        form.classList.add("was-validated");
        return;
      }

      if (submitBtn) submitBtn.disabled = true;

      // STEP 1: Upload File to /upload_file
      showAlert("primary", "Uploading PDF file...", true);
      
      const fileObj = docInput.files[0];
      const [yearStr, monthStr] = monthInput.value.split("-"); // Extract YYYY and MM

      const uploadDataPayload = new FormData();
      uploadDataPayload.append("file", fileObj);
      uploadDataPayload.append("month", monthStr);
      uploadDataPayload.append("year", yearStr);

      let returnedFilePath = "";

      try {
        const uploadRes = await fetch(`${API_BASE}/upload_file`, {
          method: "POST",
          headers: getAuthHeader(),
          body: uploadDataPayload,
        });

        const uploadData = await uploadRes.json();

        // Check for error responses or status: -1
        if (!uploadRes.ok || uploadData.status === -1 || uploadData.error) {
          const reasonMsg = uploadData.reason || uploadData.error || `Upload failed with status code ${uploadRes.status}`;
          throw new Error(reasonMsg);
        }

        // Get file path returned by server
        returnedFilePath = uploadData.filepath || uploadData.file_name || uploadData.file;
        if (!returnedFilePath) {
          throw new Error("File uploaded, but no valid file path was returned by server.");
        }

      } catch (err) {
        console.error("Step 1 Error:", err);
        showAlert("danger", `<strong>Upload Failed:</strong> ${err.message}`);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // STEP 2: Trigger Model Retraining via /retrain_model
      showAlert("primary", "File uploaded successfully. Initiating model retraining...", true);
      let jobId = "";

      try {
        const retrainRes = await fetch(`${API_BASE}/retrain_model`, {
          method: "POST",
          headers: {
            ...getAuthHeader(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ file_path: returnedFilePath }),
        });

        if (!retrainRes.ok) {
          const retrainErr = await retrainRes.json().catch(() => ({}));
          throw new Error(retrainErr.error || `Retrain request failed (HTTP ${retrainRes.status})`);
        }

        const retrainData = await retrainRes.json();
        jobId = retrainData.job_id || retrainData.uid;

        if (!jobId) {
          throw new Error("Retrain request succeeded, but no Job ID / UID was returned.");
        }

      } catch (err) {
        console.error("Step 2 Error:", err);
        showAlert("danger", `<strong>Retraining Error:</strong> ${err.message}`);
        if (submitBtn) submitBtn.disabled = false;
        return;
      }

      // STEP 3: Poll status until completion
      startStatusPolling(jobId);
    });
  }

  initUpload();
});