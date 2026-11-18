'use strict';
// VICEWIRE YouTube discovery; intended for a scheduled GitHub Actions run.
const fs = require('node:fs');
const path = require('node:path');
const API_KEY = process.env.YOUTUBE_API_KEY;
if (!API_KEY) { console.error('Missing YOUTUBE_API_KEY GitHub Actions secret.'); process.exit(1); }
const DB = path.join(__dirname,'videos.json');
const MAX_NEW_PER_SEARCH = 12;
const JOBS = [
  {q:'GTA 6 review',category:'Review'},
  {q:'GTA 6 gameplay',category:'Gameplay'},
  {q:'GTA 6 reactions',category:'Reaction'},
  {q:'GTA 6 livestream',category:'Gameplay',live:true}
];
const relevant = /\b(?:gta\s*(?:6|vi)|grand\s+theft\s+auto\s*(?:6|vi))\b/i;
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const clean = (x,n) => String(x||'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,n);
function readDB(){
  if (!fs.existsSync(DB)) return [];
  const parsed=JSON.parse(fs.readFileSync(DB,'utf8').replace(/^\uFEFF/,''));
  if (!Array.isArray(parsed)) throw Error('videos.json must contain an array');
  return parsed;
}
async function api(endpoint, params) {
  const url=new URL('https://www.googleapis.com/youtube/v3/'+endpoint);
  for(const [k,v] of Object.entries({...params,key:API_KEY})) url.searchParams.set(k,String(v));
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  const payload=await response.json();
  if(!response.ok) throw Error(`YouTube ${endpoint}: ${payload.error?.message||response.status}`);
  return payload;
}
async function main(){
  const videos=readDB();
  const ids=new Set(videos.filter(v=>v.platform==='YouTube').map(v=>v.id));
  const additions=[];
  let errors=0;
  for (const job of JOBS) {
    try {
      const params={part:'snippet',q:job.q,type:'video',order:'date',maxResults:25,safeSearch:'moderate',videoEmbeddable:'true'};
      if(job.live)params.eventType='live';
      else params.publishedAfter=new Date(Date.now()-14*86400000).toISOString();
      const found=await api('search',params);
      let added=0;
      for(const item of found.items||[]){
        const id=item.id?.videoId, s=item.snippet||{};
        if(!videoIdPattern.test(id||'') || ids.has(id))continue;
        if(!relevant.test((s.title||'')+' '+(s.description||'')))continue;
        const title=clean(s.title,150),creator=clean(s.channelTitle,80);
        if(!title||!creator)continue;
        additions.push({platform:'YouTube',id,url:'https://www.youtube.com/watch?v='+id,
          title,creator,category:job.category,spoiler:true,summary:'',
          createdAt:s.publishedAt||new Date().toISOString(),source:'youtube-api',isLive:false});
        ids.add(id);added++;
        if(added>=MAX_NEW_PER_SEARCH)break;
      }
      console.log(job.q+': '+added+' added');
    }catch(e){errors++;console.error('Search failed:',job.q,e.message)}
  }
  if(errors===JOBS.length) throw Error('All YouTube searches failed; refusing to modify feed');
  const combined=[...additions,...videos];
  // Verify livestream flags from videos.list; past livestreams are never kept as LIVE.
  const check=combined.filter(v=>v.platform==='YouTube'&&videoIdPattern.test(v.id||''))
    .filter(v=>v.isLive===true || additions.includes(v));
  for(let i=0;i<check.length;i+=50){
    try{
      const batch=check.slice(i,i+50);
      const details=await api('videos',{part:'snippet,liveStreamingDetails',id:batch.map(v=>v.id).join(',')});
      const statuses=new Map((details.items||[]).map(v=>[v.id,v.snippet?.liveBroadcastContent==='live' && Boolean(v.liveStreamingDetails?.actualStartTime) && !v.liveStreamingDetails?.actualEndTime]));
      for(const v of batch) v.isLive=statuses.get(v.id)===true;
    }catch(e){ console.error('Live verification unavailable:',e.message); for(const v of check.slice(i,i+50))v.isLive=false; }
  }
  // Keep manual entries, and a bounded history of imported entries.
  let imported=0;
  const output=combined.filter(v=>{
    if(v.source!=='youtube-api')return true;
    return ++imported<=500;
  });
  const before=JSON.stringify(videos);
  const after=JSON.stringify(output);
  if(before!==after){
    fs.writeFileSync(DB+'.tmp',JSON.stringify(output,null,2)+'\n','utf8');
    fs.renameSync(DB+'.tmp',DB);
  }
  console.log('Total:',output.length,'new:',additions.length,'updated:',before!==after);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});