'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Optional local .env. Never commit it. Render uses its environment settings.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = raw.replace(/^\uFEFF/, '').match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

const production = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 3000);
const HOST = production ? '0.0.0.0' : '127.0.0.1';
const DATA_PATH = path.join(__dirname, 'videos.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
if (production && ADMIN_PASSWORD.length < 32) {
  console.error('Refusing production startup: set ADMIN_PASSWORD to a unique secret of at least 32 characters.');
  process.exit(1);
}
if (!production && !ADMIN_PASSWORD) console.warn('Admin login disabled: set ADMIN_PASSWORD in local .env');

const sessions = new Map();
const limits = new Map();
const SESSION_MS = 8 * 60 * 60 * 1000;
const MIME = {'/sitemap.xml':'application/xml; charset=utf-8','/robots.txt':'text/plain; charset=utf-8','/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/app.js':'application/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/sections.js':'application/javascript; charset=utf-8','/sections.css':'text/css; charset=utf-8'};

function rateLimit(req, bucket, max, periodMs) {
  const key = req.socket.remoteAddress + ':' + bucket;
  const now = Date.now();
  let record = limits.get(key);
  if (!record || record.until < now) record = {n:0, until:now + periodMs};
  record.n++;
  limits.set(key, record);
  if (limits.size > 3000) for (const [k,v] of limits) if (v.until < now) limits.delete(k);
  return record.n <= max;
}
function headers(res) {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' https://img.youtube.com data:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://www.tiktok.com; font-src 'self'");
  if (production) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  res.setHeader('Cache-Control','no-store');
}
function json(res,status,body,extra={}) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8',...extra});
  res.end(JSON.stringify(body));
}
function getCookies(req) {
  const c = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i=part.indexOf('='); if(i>0) c[part.slice(0,i).trim()] = part.slice(i+1).trim();
  }
  return c;
}
function authenticate(req) {
  const token = getCookies(req).vw_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const record = sessions.get(crypto.createHash('sha256').update(token).digest('hex'));
  return record && record.until > Date.now() ? record : null;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false; // all write operations originate in our browser UI
  try {
    const o = new URL(origin);
    const host = req.headers.host;
    return o.host === host && o.protocol === (production ? 'https:' : 'http:');
  } catch { return false; }
}
async function readJson(req, maxBytes=8192) {
  if (!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) throw new Error('Send JSON');
  let length=0, chunks=[];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw new Error('Request too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Invalid JSON'); }
}
function readVideos() {
  if (!fs.existsSync(DATA_PATH)) return [];
  const v=JSON.parse(fs.readFileSync(DATA_PATH,'utf8'));
  return Array.isArray(v) ? v : [];
}
function saveVideos(videos) {
  const tmp=DATA_PATH+'.secure-tmp';
  fs.writeFileSync(tmp,JSON.stringify(videos,null,2));
  fs.renameSync(tmp,DATA_PATH);
}
function parseVideoUrl(value) {
  if (typeof value!=='string' || value.length>700) throw new Error('Invalid video URL');
  let u; try {u=new URL(value)}catch{throw new Error('Invalid video URL')}
  if(u.protocol!=='https:' || u.username || u.password || u.port) throw new Error('HTTPS URL required');
  const host=u.hostname.toLowerCase();
  let id, platform;
  if(['www.youtube.com','youtube.com','m.youtube.com'].includes(host)) {
    id=u.searchParams.get('v');
    const match=u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/);
    if(match) id=match[1];
    platform='YouTube';
  } else if(host==='youtu.be') {
    id=u.pathname.slice(1).replace(/\/$/,''); platform='YouTube';
  } else if(['www.tiktok.com','tiktok.com','m.tiktok.com'].includes(host)) {
    const match=u.pathname.match(/^\/@[A-Za-z0-9._-]+\/video\/(\d{10,25})\/?$/);
    id=match && match[1]; platform='TikTok';
  } else throw new Error('YouTube and full TikTok URLs only');
  if(platform==='YouTube' && !/^[\w-]{11}$/.test(id||'')) throw new Error('Invalid YouTube ID');
  if(platform==='TikTok' && !id) throw new Error('Invalid TikTok video URL');
  return {id,platform,url:platform==='YouTube' ? 'https://www.youtube.com/watch?v='+id : 'https://www.tiktok.com'+u.pathname.replace(/\/$/,'')};
}
function cleanString(value,max,name,required=false) {
  if(typeof value!=='string') throw new Error(name+' must be text');
  const v=value.trim();
  if((required&&!v) || v.length>max || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(v)) throw new Error('Invalid '+name);
  return v;
}
const categories=new Set(['Review','Reaction','Viral','Gameplay','Official']);
function cookie(token,maxAge) {
  return `vw_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${production?'; Secure':''}`;
}
function passwordMatch(password) {
  // Both values use fixed-size hashes, then constant-time comparison.
  const a=crypto.scryptSync(password,'vicewire-admin-password-v1',64);
  const b=crypto.scryptSync(ADMIN_PASSWORD,'vicewire-admin-password-v1',64);
  return ADMIN_PASSWORD.length>=32 && crypto.timingSafeEqual(a,b);
}

const server=http.createServer(async(req,res)=>{
  headers(res);
  try {
    const u=new URL(req.url,'http://placeholder');
    const pathname=u.pathname;
    if(!rateLimit(req,'general',600,5*60_000)) return json(res,429,{error:'Too many requests'});
    if(req.method==='GET' && pathname==='/api/health') return json(res,200,{ok:true});
    if(req.method==='GET' && pathname==='/api/videos') {
      return json(res,200,readVideos().slice(0,2000));
    }
    if(req.method==='GET' && pathname==='/api/admin/session') {
      const session=authenticate(req);
      return json(res,200,{authenticated:!!session,csrf:session?session.csrf:null});
    }
    if(req.method==='POST' && pathname==='/api/admin/login') {
      if(!sameOrigin(req)) return json(res,403,{error:'Origin not allowed'});
      if(!rateLimit(req,'login',8,15*60_000)) return json(res,429,{error:'Too many login attempts; retry later'});
      const data=await readJson(req,4096);
      if(typeof data.password!=='string' || data.password.length>512 || !passwordMatch(data.password))
        return json(res,401,{error:'Incorrect password'});
      const token=crypto.randomBytes(32).toString('hex');
      const csrf=crypto.randomBytes(24).toString('hex');
      sessions.set(crypto.createHash('sha256').update(token).digest('hex'),{until:Date.now()+SESSION_MS,csrf});
      if(sessions.size>1000) for(const [k,v] of sessions) if(v.until<Date.now()) sessions.delete(k);
      return json(res,200,{authenticated:true,csrf},{'Set-Cookie':cookie(token,8*60*60)});
    }
    if(req.method==='POST' && pathname==='/api/admin/logout') {
      if(!sameOrigin(req)) return json(res,403,{error:'Origin not allowed'});
      const token=getCookies(req).vw_session;
      if(token) sessions.delete(crypto.createHash('sha256').update(token).digest('hex'));
      return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
    }
    if(req.method==='POST' && pathname==='/api/videos') {
      if(!sameOrigin(req)) return json(res,403,{error:'Origin not allowed'});
      const session=authenticate(req);
      if(!session) return json(res,401,{error:'Admin login required'});
      if(req.headers['x-csrf-token']!==session.csrf) return json(res,403,{error:'Invalid CSRF token'});
      if(!rateLimit(req,'write',80,15*60_000)) return json(res,429,{error:'Too many submissions'});
      const data=await readJson(req);
      const info=parseVideoUrl(data.url);
      const title=cleanString(data.title,150,'title',true);
      const creator=cleanString(data.creator,80,'creator',true);
      const summary=cleanString(data.summary||'',1000,'summary');
      if(!categories.has(data.category)) throw new Error('Invalid category');
      if(typeof data.spoiler!=='boolean') throw new Error('Spoiler value must be true or false');
      const videos=readVideos();
      if(videos.some(v=>v.url===info.url || v.platform===info.platform&&v.id===info.id))
        return json(res,409,{error:'Video already exists'});
      const video={...info,title,creator,summary,category:data.category,spoiler:data.spoiler,createdAt:new Date().toISOString()};
      videos.unshift(video); saveVideos(videos);
      return json(res,201,video);
    }
    if (req.method === 'GET' &&
    (pathname === '/sitemap.xml' || pathname === '/robots.txt')) {
  const isXml = pathname === '/sitemap.xml';
  const filename = isXml ? 'sitemap.xml' : 'robots.txt';
  const data = fs.readFileSync(path.join(__dirname, filename));
  res.writeHead(200, {
    'Content-Type': isXml
      ? 'application/xml; charset=utf-8'
      : 'text/plain; charset=utf-8'
  });
  return res.end(data);
}
    if(req.method==='GET' && MIME[pathname]) {
      const file=pathname==='/'?'/index.html':pathname;
      const content=fs.readFileSync(path.join(__dirname,file));
      res.writeHead(200,{'Content-Type':MIME[pathname]});
      return res.end(content);
    }
    return json(res,404,{error:'Not found'});
  }catch(err){
    console.error('Request error:',err.message);
    return json(res,err instanceof SyntaxError?400:err.message==='Request too large'?413:400,{error:'Invalid request'});
  }
});
server.listen(PORT,HOST,()=>console.log(`VICEWIRE secure server: http://${HOST}:${PORT} (${production?'production':'local'})`));
