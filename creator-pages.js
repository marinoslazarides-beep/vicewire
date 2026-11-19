'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://neon-afterhours-gta.onrender.com';
const DATA = path.join(__dirname, 'videos.json');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;',
    '"':'&quot;', "'":'&#39;'
  }[c]));
}

function readVideos() {
  try {
    const result = JSON.parse(fs.readFileSync(DATA, 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

function creatorGroups() {
  const groups = new Map();
  for (const video of readVideos()) {
    if (video.platform !== 'YouTube') continue;
    if (!/^[\w-]{11}$/.test(video.id || '')) continue;
    const name = String(video.creator || '').trim();
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, {name, videos:[]});
    groups.get(key).videos.push(video);
  }
  return groups;
}

function creatorUrl(name) {
  return '/creator/' + encodeURIComponent(name);
}

function sitemap(res) {
  const groups = [...creatorGroups().values()]
    .filter(g => g.videos.length >= 2)
    .sort((a,b) => a.name.localeCompare(b.name))
    .slice(0,500);

  const urls = [BASE + '/', BASE + '/creators', ...groups.map(g => BASE + creatorUrl(g.name))];

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(url => '  <url><loc>' + escapeHtml(url) + '</loc></url>')
        .join('\n') +
    '\n</urlset>\n';

  res.writeHead(200, {
    'Content-Type':'application/xml; charset=utf-8'
  });
  res.end(xml);
}

function creatorPage(res, pathname) {
  let requested;
  try {
    requested = decodeURIComponent(pathname.slice('/creator/'.length));
  } catch {
    res.writeHead(400);
    res.end('Invalid creator address');
    return;
  }

  if (!requested || requested.length > 160 || requested.includes('/')) {
    res.writeHead(404);
    res.end('Creator not found');
    return;
  }

  const group = creatorGroups().get(requested.trim().toLowerCase());

  if (!group) {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Creator not found');
    return;
  }

  const {name} = group;
  const items = [...group.videos]
    .sort((a,b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

  const canonical = BASE + creatorUrl(name);
  const description = `Discover ${name}'s GTA 6 YouTube videos, reviews and gameplay on Neon Afterhours GTA.`;

  const cards = items.map(v => {
    const title = escapeHtml(v.title || 'GTA 6 video');
    const url = 'https://www.youtube.com/watch?v=' + v.id;
    const img = 'https://img.youtube.com/vi/' + v.id + '/hqdefault.jpg';
    const views = v.viewCount == null ? '' :
      `<p class="muted">${Number(v.viewCount).toLocaleString('en-US')} views</p>`;
    const live = v.isLive === true &&
      Number.isFinite(Date.parse(v.liveCheckedAt || '')) &&
      Date.now() - Date.parse(v.liveCheckedAt) < 75 * 60000 &&
      Date.now() >= Date.parse(v.liveCheckedAt);

    return `<article class="card">
      <a class="thumb" href="${url}" rel="noopener noreferrer" target="_blank">
        <img src="${img}" alt="${title}" loading="lazy">
      </a>
      <div class="details">
        <h3>${title}</h3>
        <span class="tag">${escapeHtml(v.category || 'Video')}</span>
        ${live ? '<span class="tag">Recently verified live</span>' : ''}
        ${views}
        <p><a href="${url}" rel="noopener noreferrer" target="_blank">Watch on YouTube</a></p>
      </div>
    </article>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} GTA 6 Videos | Neon Afterhours GTA</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="robots" content="${items.length >= 2 ? 'index,follow' : 'noindex,follow'}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="stylesheet" href="/style.css">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj4KPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMDBmNWY1Ii8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2ZmNDVhYSIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+CjxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE1IiBmaWxsPSIjMTYwYjI1Ii8+CjxjaXJjbGUgY3g9IjMyIiBjeT0iMjUiIHI9IjE3IiBmaWxsPSIjZmY0NzljIi8+CjxwYXRoIGQ9Ik0xNSAzMCBINDkgTTE4IDI0IEg0NiIgc3Ryb2tlPSIjMTYwYjI1IiBzdHJva2Utd2lkdGg9IjMiLz4KPHBhdGggZD0iTTcgNTIgTDIwIDM2IEwzMiA1MSBMNDQgMzYgTDU3IDUyIgogICAgICBzdHJva2U9InVybCgjZykiIHN0cm9rZS13aWR0aD0iNSIgZmlsbD0ibm9uZSIvPgo8dGV4dCB4PSIzMiIgeT0iNjAiIGZvbnQtc2l6ZT0iMTMiIGZvbnQtZmFtaWx5PSJBcmlhbCIKICAgICAgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IndoaXRlIj5OQTwvdGV4dD4KPC9zdmc+">
<!-- NEON ANALYTICS CONSENT START -->
<script>
(function () {
  "use strict";

  var measurementId = "G-3V8LES7BB3";
  var storageKey = "neon-afterhours-analytics-choice";
  var loaded = false;

  function readChoice() {
    try { return localStorage.getItem(storageKey); }
    catch (e) { return null; }
  }

  function saveChoice(value) {
    try { localStorage.setItem(storageKey, value); }
    catch (e) {}
  }

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    var script = document.createElement("script");
    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(measurementId);

    document.head.appendChild(script);
  }

  function showChoices() {
    if (document.getElementById("neon-consent")) return;

    var panel = document.createElement("div");
    panel.id = "neon-consent";

    panel.style.cssText =
      "position:fixed;bottom:16px;left:16px;" +
      "right:16px;max-width:520px;margin:auto;" +
      "background:#170e2c;color:white;" +
      "border:1px solid #ff58b5;border-radius:14px;" +
      "padding:18px;z-index:2147483647;" +
      "box-shadow:0 6px 30px #0009;" +
      "font:14px/1.5 Arial,sans-serif;";

    var message = document.createElement("p");
    message.textContent =
      "Neon Afterhours GTA uses optional Google Analytics " +
      "to understand visits and improve the website. " +
      "Allow analytics?";
    message.style.margin = "0 0 12px";

    function makeButton(label, background, choice) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText =
        "background:" + background + ";" +
        "color:white;border:0;border-radius:8px;" +
        "padding:10px 16px;margin:4px;" +
        "cursor:pointer;font-weight:bold;";

      button.addEventListener("click", function () {
        saveChoice(choice);
        panel.remove();

        if (choice === "accepted") {
          loadAnalytics();
        }
      });

      return button;
    }

    panel.appendChild(message);
    panel.appendChild(
      makeButton("Accept analytics", "#d42d91", "accepted")
    );
    panel.appendChild(
      makeButton("Reject", "#465066", "rejected")
    );

    document.body.appendChild(panel);
  }

  function start() {
    var choice = readChoice();

    if (choice === "accepted") {
      loadAnalytics();
    } else if (choice !== "rejected") {
      showChoices();
    }

    // Allow visitors to change their choice later.
    var footer = document.querySelector("footer");
    var link = document.createElement("button");

    link.type = "button";
    link.textContent = "Analytics preferences";
    link.style.cssText =
      "background:transparent;color:inherit;" +
      "border:0;text-decoration:underline;" +
      "cursor:pointer;margin:8px;padding:6px;";

    link.addEventListener("click", function () {
      saveChoice("");
      if (readChoice() === "accepted") {
        location.reload();
      } else {
        // Reload also disables any previously loaded tag.
        location.reload();
      }
    });

    (footer || document.body).appendChild(link);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
</script>
<!-- NEON ANALYTICS CONSENT END -->
</head>
<body>
<header>
<a href="/" class="neon-brand" aria-label="Neon Afterhours GTA home">
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 640 110"
     role="img"
     aria-label="Neon Afterhours GTA">
<defs>
  <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="45%" stop-color="#82eeff"/>
    <stop offset="100%" stop-color="#fa4fa9"/>
  </linearGradient>
  <filter id="glow" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="2.5" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
<rect x="4" y="4" width="632" height="102" rx="12"
      fill="#100b20" fill-opacity=".45"/>
<path d="M12 90 L110 15 H530 L628 90"
      fill="none" stroke="#00ecf4"
      stroke-width="3" opacity=".8"/>
<text x="320" y="36" text-anchor="middle"
      font-family="Arial,sans-serif"
      font-weight="900" font-style="italic"
      font-size="33" letter-spacing="5"
      fill="#ff55b9" filter="url(#glow)">NEON</text>
<text x="320" y="76" text-anchor="middle"
      font-family="Arial,sans-serif"
      font-weight="900" font-style="italic"
      font-size="47" letter-spacing="1"
      fill="url(#chrome)">AFTERHOURS</text>
<text x="575" y="99" text-anchor="middle"
      font-family="Arial,sans-serif"
      font-weight="900" font-style="italic"
      font-size="27" fill="#ff55b9">GTA</text>
</svg>
</a>
<nav><a href="/">Back to all GTA 6 videos</a></nav>
</header>
<main>
<section class="hero">
<p class="eyebrow">GTA 6 CREATOR</p>
<h1>${escapeHtml(name)}</h1>
<p>${escapeHtml(description)}</p>
<p>${items.length} videos featured</p>
</section>
<div class="grid">${cards}</div>
</main>
<footer>Independent creator discovery. Not affiliated with YouTube or Rockstar Games.</footer>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type':'text/html; charset=utf-8'
  });
  res.end(html);
}

function creatorDirectory(res) {
  const groups = [...creatorGroups().values()]
    .sort((a,b) =>
      b.videos.length - a.videos.length ||
      a.name.localeCompare(b.name)
    );

  const cards = groups.map(group => {
    const name = escapeHtml(group.name);
    const count = group.videos.length;
    const url = creatorUrl(group.name);

    return `<a class="creator-tile" href="${escapeHtml(url)}">
      <strong>${name}</strong>
      <span>${count} ${count === 1 ? 'video' : 'videos'}</span>
    </a>`;
  }).join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GTA 6 YouTube Creators | Neon Afterhours GTA</title>
<meta name="description" content="Discover GTA 6 YouTube creators, videos, livestreams and reviews on Neon Afterhours GTA.">
<link rel="canonical" href="${BASE}/creators">
<link rel="stylesheet" href="/style.css">
<style>
.creator-list {
 display:grid;
 grid-template-columns:repeat(auto-fill,minmax(200px,1fr));
 gap:14px;
 margin:25px 0;
}
.creator-tile {
 display:flex;
 flex-direction:column;
 gap:9px;
 background:#262132;
 color:white;
 padding:18px;
 border:1px solid #40374b;
 border-radius:12px;
 text-decoration:none;
 overflow-wrap:anywhere;
}
.creator-tile:hover {
 border-color:#fb4eac;
}
.creator-tile span {
 color:#b9afc1;
 font-size:13px;
}
</style>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CjxkZWZzPgo8bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj4KPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMDBmNWY1Ii8+CjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2ZmNDVhYSIvPgo8L2xpbmVhckdyYWRpZW50Pgo8L2RlZnM+CjxyZWN0IHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgcng9IjE1IiBmaWxsPSIjMTYwYjI1Ii8+CjxjaXJjbGUgY3g9IjMyIiBjeT0iMjUiIHI9IjE3IiBmaWxsPSIjZmY0NzljIi8+CjxwYXRoIGQ9Ik0xNSAzMCBINDkgTTE4IDI0IEg0NiIgc3Ryb2tlPSIjMTYwYjI1IiBzdHJva2Utd2lkdGg9IjMiLz4KPHBhdGggZD0iTTcgNTIgTDIwIDM2IEwzMiA1MSBMNDQgMzYgTDU3IDUyIgogICAgICBzdHJva2U9InVybCgjZykiIHN0cm9rZS13aWR0aD0iNSIgZmlsbD0ibm9uZSIvPgo8dGV4dCB4PSIzMiIgeT0iNjAiIGZvbnQtc2l6ZT0iMTMiIGZvbnQtZmFtaWx5PSJBcmlhbCIKICAgICAgZm9udC13ZWlnaHQ9ImJvbGQiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IndoaXRlIj5OQTwvdGV4dD4KPC9zdmc+">
<!-- NEON ANALYTICS CONSENT START -->
<script>
(function () {
  "use strict";

  var measurementId = "G-3V8LES7BB3";
  var storageKey = "neon-afterhours-analytics-choice";
  var loaded = false;

  function readChoice() {
    try { return localStorage.getItem(storageKey); }
    catch (e) { return null; }
  }

  function saveChoice(value) {
    try { localStorage.setItem(storageKey, value); }
    catch (e) {}
  }

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    var script = document.createElement("script");
    script.async = true;
    script.src =
      "https://www.googletagmanager.com/gtag/js?id=" +
      encodeURIComponent(measurementId);

    document.head.appendChild(script);
  }

  function showChoices() {
    if (document.getElementById("neon-consent")) return;

    var panel = document.createElement("div");
    panel.id = "neon-consent";

    panel.style.cssText =
      "position:fixed;bottom:16px;left:16px;" +
      "right:16px;max-width:520px;margin:auto;" +
      "background:#170e2c;color:white;" +
      "border:1px solid #ff58b5;border-radius:14px;" +
      "padding:18px;z-index:2147483647;" +
      "box-shadow:0 6px 30px #0009;" +
      "font:14px/1.5 Arial,sans-serif;";

    var message = document.createElement("p");
    message.textContent =
      "Neon Afterhours GTA uses optional Google Analytics " +
      "to understand visits and improve the website. " +
      "Allow analytics?";
    message.style.margin = "0 0 12px";

    function makeButton(label, background, choice) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.style.cssText =
        "background:" + background + ";" +
        "color:white;border:0;border-radius:8px;" +
        "padding:10px 16px;margin:4px;" +
        "cursor:pointer;font-weight:bold;";

      button.addEventListener("click", function () {
        saveChoice(choice);
        panel.remove();

        if (choice === "accepted") {
          loadAnalytics();
        }
      });

      return button;
    }

    panel.appendChild(message);
    panel.appendChild(
      makeButton("Accept analytics", "#d42d91", "accepted")
    );
    panel.appendChild(
      makeButton("Reject", "#465066", "rejected")
    );

    document.body.appendChild(panel);
  }

  function start() {
    var choice = readChoice();

    if (choice === "accepted") {
      loadAnalytics();
    } else if (choice !== "rejected") {
      showChoices();
    }

    // Allow visitors to change their choice later.
    var footer = document.querySelector("footer");
    var link = document.createElement("button");

    link.type = "button";
    link.textContent = "Analytics preferences";
    link.style.cssText =
      "background:transparent;color:inherit;" +
      "border:0;text-decoration:underline;" +
      "cursor:pointer;margin:8px;padding:6px;";

    link.addEventListener("click", function () {
      saveChoice("");
      if (readChoice() === "accepted") {
        location.reload();
      } else {
        // Reload also disables any previously loaded tag.
        location.reload();
      }
    });

    (footer || document.body).appendChild(link);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
</script>
<!-- NEON ANALYTICS CONSENT END -->
</head>
<body>
<header>
<a href="/" class="neon-brand" aria-label="Neon Afterhours GTA home">
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 640 110"
     role="img"
     aria-label="Neon Afterhours GTA">
<defs>
  <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="45%" stop-color="#82eeff"/>
    <stop offset="100%" stop-color="#fa4fa9"/>
  </linearGradient>
  <filter id="glow" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="2.5" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
<rect x="4" y="4" width="632" height="102" rx="12"
      fill="#100b20" fill-opacity=".45"/>
<path d="M12 90 L110 15 H530 L628 90"
      fill="none" stroke="#00ecf4"
      stroke-width="3" opacity=".8"/>
<text x="320" y="36" text-anchor="middle"
      font-family="Arial,sans-serif"
      font-weight="900" font-style="italic"
      font-size="33" letter-spacing="5"
      fill="#ff55b9" filter="url(#glow)">NEON</text>
<text x="320" y="76" text-anchor="middle"
      font-family="Arial,sans-serif"
      font-weight="900" font-style="italic"
      font-size="47" letter-spacing="1"
      fill="url(#chrome)">AFTERHOURS</text>
<text x="575" y="99" text-anchor="middle"
      font-family="Arial,sans-serif"
      font-weight="900" font-style="italic"
      font-size="27" fill="#ff55b9">GTA</text>
</svg>
</a>
<nav><a href="/">Back to Neon Afterhours GTA</a></nav>
</header>
<main>
<section class="hero">
<p class="eyebrow">THE GTA 6 COMMUNITY</p>
<h1>DISCOVER <em>CREATORS.</em></h1>
<p>Explore YouTubers featured on Neon Afterhours GTA.</p>
<p>${groups.length} creators listed</p>
</section>
<div class="creator-list">${cards}</div>
</main>
<footer>Neon Afterhours GTA - Independent GTA 6 discovery.</footer>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type':'text/html; charset=utf-8'
  });
  res.end(html);
}
function handle(req,res,pathname) {
  if (req.method !== 'GET') return false;
  if (pathname === '/creators') {
    creatorDirectory(res);
    return true;
  }
  if (pathname === '/sitemap.xml') {
    sitemap(res);
    return true;
  }
  if (pathname.startsWith('/creator/')) {
    creatorPage(res,pathname);
    return true;
  }
  return false;
}

module.exports = {handle};