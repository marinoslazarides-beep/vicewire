'use strict';
// Collect public metadata for videos already listed; keep API keys out of the repo.
const fs=require('node:fs');
const path=require('node:path');
const apiKey=process.env.YOUTUBE_API_KEY;
if(!apiKey){console.error('YOUTUBE_API_KEY is missing');process.exit(1)}
const db=path.join(__dirname,'videos.json');
const items=JSON.parse(fs.readFileSync(db,'utf8').replace(/^\uFEFF/,''));
if(!Array.isArray(items))throw Error('videos.json must contain an array');
const usable=items.filter(v=>v.platform==='YouTube'&&/^[A-Za-z0-9_-]{11}$/.test(v.id||''));
async function fetchBatch(batch){
  const url=new URL('https://www.googleapis.com/youtube/v3/videos');
  for(const [k,v] of Object.entries({part:'snippet,statistics,liveStreamingDetails',id:batch.map(v=>v.id).join(','),key:apiKey})) url.searchParams.set(k,v);
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  const data=await response.json();
  if(!response.ok)throw Error('YouTube metadata lookup failed: '+(data.error?.message||response.status));
  return new Map((data.items||[]).map(v=>[v.id,v]));
}
async function main(){
  const checkedAt=new Date().toISOString();
  for(let i=0;i<usable.length;i+=50){
    const batch=usable.slice(i,i+50);
    const details=await fetchBatch(batch);
    for(const video of batch){
      const item=details.get(video.id);
      if(!item){video.isLive=false;continue}
      const views=Number(item.statistics?.viewCount);
      if(item.statistics?.viewCount!==undefined && Number.isFinite(views))video.viewCount=views;
      const live=item.snippet?.liveBroadcastContent==='live' &&
        Boolean(item.liveStreamingDetails?.actualStartTime)&&
        !item.liveStreamingDetails?.actualEndTime;
      video.isLive=Boolean(live);
      video.liveCheckedAt=checkedAt;
      if(live && item.liveStreamingDetails?.concurrentViewers!==undefined)
        video.concurrentViewers=Number(item.liveStreamingDetails.concurrentViewers);
      else delete video.concurrentViewers;
    }
  }
  // Avoid needless commits on every hourly refresh if no public data changed.
  const current=fs.readFileSync(db,'utf8').replace(/^\uFEFF/,'');
  const updated=JSON.stringify(items,null,2)+'\n';
  if(updated!==current)fs.writeFileSync(db,updated,'utf8');
  console.log('Updated YouTube statistics for',usable.length,'videos; live:',usable.filter(v=>v.isLive).length);
}
main().catch(err=>{console.error(err.message);process.exitCode=1});