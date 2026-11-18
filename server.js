const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB = path.join(ROOT, "videos.json");
const publicMode = process.env.NODE_ENV === "production";

if (!fs.existsSync(DB)) fs.writeFileSync(DB, "[]");

function readVideos() {
  try { return JSON.parse(fs.readFileSync(DB, "utf8")); }
  catch { return []; }
}

function respond(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(data));
}

function parseVideoUrl(input) {
  const u = new URL(input);
  if (u.protocol !== "https:") throw Error("Use HTTPS.");
  const host = u.hostname.toLowerCase();

  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    let id = u.searchParams.get("v");
    if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/"))
      id = u.pathname.split("/")[2];
    if (!/^[\w-]{11}$/.test(id || "")) throw Error("Invalid YouTube video.");
    return {platform:"YouTube", url:"https://www.youtube.com/watch?v="+id, id};
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (!/^[\w-]{11}$/.test(id)) throw Error("Invalid YouTube video.");
    return {platform:"YouTube", url:"https://www.youtube.com/watch?v="+id, id};
  }
  if (["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host)) {
    const match = u.pathname.match(/\/video\/(\d+)/);
    if (!match) throw Error("Use a full TikTok video URL, not a short link.");
    return {platform:"TikTok", url:"https://www.tiktok.com"+u.pathname, id:match[1]};
  }
  throw Error("Only YouTube and TikTok links are supported.");
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;

  if (req.method === "GET" && pathname === "/api/health")
    return respond(res, 200, {ok:true});

  if (req.method === "GET" && pathname === "/api/videos")
    return respond(res, 200, readVideos());

  if (req.method === "POST" && pathname === "/api/videos") {
    if (publicMode) return respond(res, 403, {error:"Public submissions are disabled."});

    let body = "";
    req.on("data", part => {
      body += part;
      if (body.length > 20000) req.destroy();
    });
    req.on("end", () => {
      try {
        const item = JSON.parse(body);
        const parsed = parseVideoUrl(item.url);
        const title = String(item.title || "").trim().slice(0,150);
        const creator = String(item.creator || "").trim().slice(0,80);
        const validCategories = ["Review","Reaction","Viral","Gameplay","Official"];
        const category = validCategories.includes(item.category) ? item.category : "Viral";
        if (!title || !creator) throw Error("Title and creator are required.");
        const videos = readVideos();
        if (videos.some(v => v.url === parsed.url))
          throw Error("This video is already added.");
        const video = {
          ...parsed, title, creator, category,
          spoiler: Boolean(item.spoiler),
          summary: String(item.summary || "").slice(0,1000),
          createdAt: new Date().toISOString()
        };
        videos.unshift(video);
        fs.writeFileSync(DB, JSON.stringify(videos,null,2));
        respond(res, 201, video);
      } catch (e) {
        respond(res, 400, {error:e.message});
      }
    });
    return;
  }

  if (req.method !== "GET" || pathname !== "/")
    return respond(res, 404, {error:"Not found"});

  res.writeHead(200, {
    "Content-Type":"text/html; charset=utf-8",
    "X-Content-Type-Options":"nosniff"
  });
  fs.createReadStream(path.join(ROOT,"index.html")).pipe(res);
});

server.listen(PORT, "0.0.0.0", () =>
  console.log("VICEWIRE running at http://localhost:"+PORT)
);
