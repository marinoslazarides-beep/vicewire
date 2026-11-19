(function () {
  "use strict";

  const ID = "G-3V8LES7BB3";
  const KEY = "neon-ga4-consent-v3";
  let loaded = false;

  function getChoice() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function saveChoice(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {}
  }

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", ID);

    const script = document.createElement("script");
    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(ID);

    document.head.appendChild(script);
  }

  function showBanner() {
    if (document.getElementById("neon-consent")) return;

    const panel = document.createElement("section");
    panel.id = "neon-consent";
    panel.setAttribute("role", "dialog");
    panel.setAttribute(
      "aria-label",
      "Analytics consent"
    );

    const message = document.createElement("p");
    message.textContent =
      "Neon Afterhours GTA uses optional Google " +
      "Analytics to understand website visits. " +
      "Would you like to allow analytics?";

    const actions = document.createElement("div");
    actions.className = "neon-consent-actions";

    function addButton(label, choice) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.className =
        choice === "accepted"
          ? "neon-consent-accept"
          : "neon-consent-reject";

      button.addEventListener("click", function () {
        saveChoice(choice);
        panel.remove();

        if (choice === "accepted") {
          loadAnalytics();
        } else if (loaded) {
          location.reload();
        }
      });

      actions.appendChild(button);
    }

    addButton("Accept analytics", "accepted");
    addButton("Reject", "rejected");

    panel.appendChild(message);
    panel.appendChild(actions);

    document.body.appendChild(panel);
  }

  function start() {
    if (getChoice() === "accepted") {
      loadAnalytics();
    } else if (getChoice() !== "rejected") {
      showBanner();
    }

    const preferences = document.createElement("button");
    preferences.type = "button";
    preferences.id = "neon-analytics-preferences";
    preferences.textContent = "Analytics preferences";

    preferences.addEventListener("click", showBanner);

    const footer = document.querySelector("footer");
    (footer || document.body).appendChild(preferences);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();