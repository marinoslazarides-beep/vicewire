'use strict';
// Tabs use the same authenticated, escaped card-rendering logic as app.js.
// Existing filters, bookmarks, video player and admin forms remain intact.
let vicewireView = 'newest';
const oldRender = render;
const tabArea = document.createElement('div');
tabArea.className = 'video-tabs';
tabArea.setAttribute('role','group');
tabArea.setAttribute('aria-label','Choose a video collection');
const tabs = [
  {id:'live', text:'LIVE NOW'},
  {id:'popular', text:'MOST WATCHED'},
  {id:'newest', text:'NEWEST'}
];
const tabButtons = new Map();
for (const tab of tabs) {
  const button=document.createElement('button');
  button.type='button';
  button.textContent=tab.text;
  button.className='secondary';
  button.addEventListener('click',()=>{vicewireView=tab.id;render()});
  tabArea.append(button);
  tabButtons.set(tab.id,button);
}
const subtitle=document.createElement('p');
subtitle.className='muted video-mode-label';
const filters=document.querySelector('.filters');
filters.parentNode.insertBefore(tabArea, filters);
filters.parentNode.insertBefore(subtitle, filters);
const LIVE_MAX_AGE_MS=75*60*1000;
function verifiedLive(v) {
  return v.isLive === true && Number.isFinite(Date.parse(v.liveCheckedAt||'')) &&
    (Date.now()-Date.parse(v.liveCheckedAt))>=0 &&
    (Date.now()-Date.parse(v.liveCheckedAt))<LIVE_MAX_AGE_MS;
}
function publishedTime(v) {return Number.isFinite(Date.parse(v.createdAt||''))?Date.parse(v.createdAt):0;}
render = function () {
  // Temporarily supply the chosen collection to the existing safe renderer.
  const complete=videos;
  let subset=complete.filter(v=>v.platform==='YouTube');
  if(vicewireView==='live') {
    subset=subset.filter(verifiedLive).sort((a,b)=>Number(b.concurrentViewers||0)-Number(a.concurrentViewers||0));
  } else if(vicewireView==='popular') {
    subset=subset.filter(v=>v.viewCount!==null && v.viewCount!==undefined && Number.isFinite(Number(v.viewCount)))
      .sort((a,b)=>Number(b.viewCount)-Number(a.viewCount));
  } else {
    subset.sort((a,b)=>publishedTime(b)-publishedTime(a));
  }
  for(const [key,button] of tabButtons) {
    button.classList.toggle('active',key===vicewireView);
    button.setAttribute('aria-pressed',String(key===vicewireView));
  }
  const labels={live:'Streams verified live within the last 75 minutes. Status may change.',
    popular:'Ranked by YouTube view counts from the latest metadata refresh.',
    newest:'Newest uploads first, based on YouTube publish dates.'};
  subtitle.textContent=labels[vicewireView];
  videos=subset;
  try {oldRender();} finally {videos=complete;}
  // The existing renderer also applies text/category/spoiler/saved filters.
  const query=el('search').value.toLowerCase(), category=el('category').value,platform=el('platform').value,spoilerFree=el('safe').checked;
  const visible=subset.filter(v=>(!query||(v.title+' '+v.creator+' '+(v.summary||'')).toLowerCase().includes(query))&&
    (!category||v.category===category)&&(!platform||v.platform===platform)&&(!spoilerFree||!v.spoiler)&&(!savedOnly||saved.includes(v.url)));
  document.querySelectorAll('#feed .card').forEach((card,i)=>{
    const v=visible[i]; if(!v)return;
    const label=card.querySelector('.details .muted');
    if(label && vicewireView==='popular') label.textContent += ' | '+Number(v.viewCount).toLocaleString()+' views';
    if(label && vicewireView==='live') label.textContent += ' | LIVE (recently verified)';
  });
  if(vicewireView==='live' && !visible.length) el('feed').textContent='No recently verified live GTA 6 streams. Try Newest or Most Watched.';
  if(vicewireView==='popular' && !subset.length) el('feed').textContent='View counts are being collected. Run the metadata refresh workflow first.';
};
render();