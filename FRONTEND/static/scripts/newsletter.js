/**
 * Kab Tak – Newsletter Cookie & Popup Controller
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const COOKIE_NAME = "kabtak_newsletter_subscribed";
  const COOKIE_DAYS = 365; // Cookie lifetime in days once accepted
  const API_URL = "http://localhost:3000/subs_newsletter";

  // Helper function to read cookie value
  function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i].trim();
      if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length));
    }
    return null;
  }

  // Helper function to set cookie
  function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${date.toUTCString()};path=/;SameSite=Strict`;
  }
  function getSession() {
    try {
      return JSON.parse(sessionStorage.getItem("kabtak_session"));
    } catch {
      return null;
    }
  }

  function initNewsletterPopup() {

    // 1. Check if user has already subscribed
    const isSubscribed = getCookie(COOKIE_NAME);
    if (isSubscribed === "true" || getSession() != null) {
      return; // Do not show flyer if cookie exists
    }

    const modalElement = document.getElementById("newsletterModal");
    if (!modalElement) return;

    // Initialize Bootstrap Modal instance
    const modalInstance = new bootstrap.Modal(modalElement);

    // Show modal flyer after a 1 second delay on page load
    setTimeout(() => {
      modalInstance.show();
    }, 1000);

    const form = document.getElementById("newsletter-form");
    const emailInput = document.getElementById("newsletter-email");

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Client-side email validation
        if (!emailInput.value || !emailInput.checkValidity()) {
          form.classList.add("was-validated");
          return;
        }

        const email = emailInput.value.trim();
        const submitBtn = form.querySelector('button[type="submit"]');

        try {
          if (submitBtn) submitBtn.disabled = true;

          // Make HTTP POST call to backend API (or fake it out in mock mode)
          if (typeof CONFIG !== "undefined" && CONFIG.USE_MOCK_DATA) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          } else {
            const response = await fetch(API_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ email: email }),
            });

            if (!response.ok) {
              throw new Error(`Server returned status: ${response.status}`);
            }
          }

          // Store subscription cookie upon successful API response ("Yes")
          setCookie(COOKIE_NAME, "true", COOKIE_DAYS);

          // Hide modal overlay
          modalInstance.hide();
        } catch (err) {
          console.error("Failed to subscribe to newsletter:", err);
          alert("Something went wrong with your subscription. Please try again.");
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }
  }

  initNewsletterPopup();
});