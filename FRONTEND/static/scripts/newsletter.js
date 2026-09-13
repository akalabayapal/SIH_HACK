/**
 * Kab Tak – Newsletter Cookie & Popup Controller
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const COOKIE_NAME = "kabtak_newsletter_subscribed";
  const COOKIE_DAYS = 365; // Cookie lifetime in days once accepted

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

  function initNewsletterPopup() {
    // 1. Check if user has already subscribed
    const isSubscribed = getCookie(COOKIE_NAME);
    if (isSubscribed === "true") {
      return; // Do not show flyer if cookie exists
    }

    const modalElement = document.getElementById("newsletterModal");
    if (!modalElement) return;

    // Initialize Bootstrap Modal instance
    const modalInstance = new bootstrap.Modal(modalElement);
    
    // Show modal flyer after a slight delay (1 second) on page load
    setTimeout(() => {
      modalInstance.show();
    }, 1000);

    const form = document.getElementById("newsletter-form");
    const emailInput = document.getElementById("newsletter-email");

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();

        // Client-side email validation
        if (!emailInput.value || !emailInput.checkValidity()) {
          form.classList.add("was-validated");
          return;
        }

        // Store subscription cookie upon user acceptance ("Yes")
        setCookie(COOKIE_NAME, "true", COOKIE_DAYS);

        // Hide modal
        modalInstance.hide();
      });
    }
  }

  initNewsletterPopup();
});