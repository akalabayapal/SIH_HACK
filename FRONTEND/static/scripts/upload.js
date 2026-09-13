/**
 * Kab Tak – upload.js
 * Workflow with Cookie Persistence & Form Locking:
 * 1. Checks for active job in cookies on page load to restore state after refresh.
 * 2. Uploads PDF to http://localhost:3000/upload_file
 * 3. Triggers model retraining via http://localhost:3000/retrain_model
 * 4. Disables form controls & stores job ID in cookie while training runs.
 * 5. Polls http://localhost:3000/get_training_status/<job_id> every 30s.
 * 6. Re-enables form and clears cookie upon job completion.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const USE_MOCK_DATA = false; // Set to true to fake the upload+retrain flow without a backend
  const API_BASE = "http://localhost:3000";
  const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB max file size
  const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
  const POLL_INTERVAL_MS = 30000; // 30 seconds
  const COOKIE_NAME = "kabtak_training_job_id";

  let pollingTimer = null;

  // --- Cookie Helper Functions ---
  function setCookie(name, value, hours = 24) {
    const date = new Date();
    date.setTime(date.getTime() + hours * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${date.toUTCString()};path=/;SameSite=Strict`;
  }

  function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
  }

  function eraseCookie(name) {
    document.cookie = `${name}=; Max-Age=-99999999; path=/;`;
  }

  // --- Auth Helpers ---
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

  function initLogout() {
    document.getElementById("nav-logout")?.addEventListener("click", () => {
      sessionStorage.removeItem("kabtak_session");
      window.location.href = "index.html";
    });
  }

  function initUpload() {
    const form = document.getElementById("upload-form");
    if (!form) return;

    // Admin authorization guard
    if (!isAdmin()) {
      window.location.replace("login.html?next=upload.html");
      return;
    }

    const uploadContent = document.getElementById("upload-content");
    if (uploadContent) uploadContent.hidden = false;

    const docInput = form.elements.namedItem("document");
    const monthInput = form.elements.namedItem("reporting_month");
    const submitBtn = form.querySelector('button[type="submit"]');
    const alertBox = document.getElementById("upload-alert");

    // Toggle all form controls disabled/enabled
    const setFormDisabled = (disabled) => {
      if (monthInput) monthInput.disabled = disabled;
      if (docInput) docInput.disabled = disabled;
      if (submitBtn) submitBtn.disabled = disabled;
    };

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

    // STEP 3: Poll status endpoint every 30 seconds
    const startStatusPolling = (jobId) => {
      let checkCount = 0;

      // Lock form and save state to cookie
      setFormDisabled(true);
      setCookie(COOKIE_NAME, jobId);

      const checkStatus = async () => {
        checkCount++;
        const now = new Date().toLocaleTimeString();
        
        showAlert(
          "info",
          `<strong>Retraining Model in Progress...</strong> (Job ID: <code>${jobId}</code>)<br>` +
          `<small class="text-muted">Form is locked until completion. Status check #${checkCount} at ${now}. Polling every 30s...</small>`,
          true
        );

        try {
          let isCompleted;
          if (USE_MOCK_DATA) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            isCompleted = checkCount >= 2; // pretend training finishes after a couple of polls
          } else {
            const res = await fetch(`${API_BASE}/get_training_status/${encodeURIComponent(jobId)}`, {
              headers: getAuthHeader(),
            });

            if (!res.ok) {
              throw new Error(`Failed to check job status (HTTP ${res.status})`);
            }

            // Backend returns boolean: true = completed, false = running
            isCompleted = await res.json();
          }

          if (isCompleted === true) {
            clearInterval(pollingTimer);
            eraseCookie(COOKIE_NAME);
            
            showAlert("success", `<strong>Success!</strong> Model retraining completed for Job ID: <code>${jobId}</code>.`);
            setFormDisabled(false);
            form.reset();
            form.classList.remove("was-validated");
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      checkStatus();
      pollingTimer = setInterval(checkStatus, POLL_INTERVAL_MS);
    };

    // --- State Restoration on Page Load ---
    const savedJobId = getCookie(COOKIE_NAME);
    if (savedJobId) {
      startStatusPolling(savedJobId);
    }

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

      setFormDisabled(true);

      // STEP 1: Upload File to /upload_file
      showAlert("primary", "Uploading PDF file...", true);
      
      const fileObj = docInput.files[0];
      const [yearStr, monthStr] = monthInput.value.split("-");

      const uploadDataPayload = new FormData();
      uploadDataPayload.append("file", fileObj);
      uploadDataPayload.append("month", monthStr);
      uploadDataPayload.append("year", yearStr);

      let returnedFilePath = "";

      try {
        if (USE_MOCK_DATA) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          returnedFilePath = `mock-upload-${Date.now()}.pdf`;
        } else {
          const uploadRes = await fetch(`${API_BASE}/upload_file`, {
            method: "POST",
            headers: getAuthHeader(),
            body: uploadDataPayload,
          });

          const uploadData = await uploadRes.json();

          if (!uploadRes.ok || uploadData.status === -1 || uploadData.error) {
            const reasonMsg = uploadData.reason || uploadData.error || `Upload failed (HTTP ${uploadRes.status})`;
            throw new Error(reasonMsg);
          }
          if(uploadData.status == 0)
          {
          returnedFilePath = uploadData.file_id;
          if (!returnedFilePath) {
            throw new Error("File uploaded, but no valid file path was returned by server.");
          }
        }
        else
        {
          const reason = uploadData.reason;
          throw new Error("Error:"+reason);


        }
        }

      } catch (err) {
        console.error("Step 1 Error:", err);
        showAlert("danger", `<strong>Upload Failed:</strong> ${err.message}`);
        setFormDisabled(false);
        return;
      }

      // STEP 2: Trigger Model Retraining via /retrain_model
      showAlert("primary", "File uploaded successfully. Initiating model retraining...", true);
      let jobId = "";

      try {
        if (USE_MOCK_DATA) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          jobId = `mock-job-${Date.now()}`;
        } else {
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
        }

      } catch (err) {
        console.error("Step 2 Error:", err);
        showAlert("danger", `<strong>Retraining Error:</strong> ${err.message}`);
        setFormDisabled(false);
        return;
      }

      // STEP 3: Lock form, save to cookie, and poll until completion
      startStatusPolling(jobId);
    });
  }

  initLogout();
  initUpload();
});