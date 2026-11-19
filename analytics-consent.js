(function () {
  "use strict";

  const KEY = "neon-analytics-consent-v2";
  const ID = "G-3V8LES7BB3";
  let analyticsLoaded = false;

  function getChoice() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  }

  function saveChoice(choice) {
    try {
      localStorage.setItem(KEY, choice);
    } catch {}
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      dataLayer.push(arguments);
    };

    gtag("js", new Date());
    gtag("config", ID);

    const script = document.createElement("script");
    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(ID);

    document.head.appendChild(script);
  }

  function showBanner() {
    if (document.getElementById("neon-consent")) return;

    const panel = document.createElement("div");
    panel.id = "neon-consent";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Analytics preferences");

    panel.style.cssText = [
      "position:fixed",
      "bottom:12px",
      "left:12px",
      "right:12px",
      "max-width:480px",
      "margin:auto",
      "padding:18px",
      "background:#180d2d",
      "color:#ffffff",
      "border:2px solid #ff54b8",
      "border-radius:14px",
      "box-shadow:0 8px 35px #000b",
      "font:14px/1.5 Arial,sans-serif",
      "z-index:2147483647"
    ].join(";");

    const message = document.createElement("p");
    message.textContent =
      "We use optional Google Analytics to measure " +
      "website visits. Do you allow analytics?";
    message.style.margin = "0 0 12px";

    function button(label, color, value) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.style.cssText =
        "padding:10px 15px;margin:4px;" +
        "background:" + color + ";" +
        "color:white;border:0;border-radius:8px;" +
        "cursor:pointer;font-weight:bold;";

      b.onclick = function () {
        saveChoice(value);
        panel.remove();

        if (value === "accepted") {
          loadAnalytics();
        } else if (analyticsLoaded) {
          location.reload();
        }
      };

      return b;
    }

    panel.appendChild(message);
    panel.appendChild(button("Accept", "#d42d91", "accepted"));
    panel.appendChild(button("Reject", "#465066", "rejected"));

    document.body.appendChild(panel);
  }

  function start() {
    const choice = getChoice();

    if (choice === "accepted") {
      loadAnalytics();
    } else if (choice !== "rejected") {
      showBanner();
    }

    const preferences = document.createElement("button");
    preferences.type = "button";
    preferences.textContent = "Analytics preferences";
    preferences.style.cssText =
      "display:block;margin:10px auto;" +
      "background:transparent;color:inherit;" +
      "border:0;text-decoration:underline;cursor:pointer;";

    preferences.onclick = showBanner;

    (document.querySelector("footer") || document.body)
      .appendChild(preferences);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();