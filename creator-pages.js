'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://vicewire.onrender.com';
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
</head>
<body>
<header>
<strong>NEON<span> AFTERHOURS GTA</span></strong>
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
</head>
<body>
<header>
<strong>NEON<span> AFTERHOURS GTA</span></strong>
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