'use strict';
let videos=[],csrf=null,savedOnly=false,saved=[];
try{saved=JSON.parse(localStorage.getItem('vicewire_saved')||'[]')}catch{saved=[]}
const el=id=>document.getElementById(id);
async function jsonFetch(url, options){const r=await fetch(url,{credentials:'same-origin',...options});const body=await r.json();if(!r.ok)throw Error(body.error||'Request failed');return body}
async function load(){videos=await jsonFetch('/api/videos');render();renderCreators()}
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
function renderCreators(){
  const list=document.getElementById('creatorList');
  if(!list)return;

  const creators=new Map();

  for(const v of videos){
    if(v.platform!=='YouTube' || !v.creator)continue;
    const name=v.creator.trim();
    if(!name)continue;
    const key=name.toLowerCase();
    if(!creators.has(key)){
      creators.set(key,{name,count:0});
    }
    creators.get(key).count++;
  }

  list.replaceChildren();

  const sorted=[...creators.values()]
    .sort((a,b)=>b.count-a.count || a.name.localeCompare(b.name));

  for(const c of sorted){
    const link=document.createElement('a');
    link.className='creator-tile';
    link.href='/creator/'+encodeURIComponent(c.name);

    const title=document.createElement('strong');
    title.textContent=c.name;

    const count=document.createElement('span');
    count.textContent=c.count+' videos';

    link.append(title,count);
    list.append(link);
  }
}
function render(){
 const query=el('search').value.toLowerCase(),category=el('category').value,platform=el('platform').value,spoilerFree=el('safe').checked;
 const filtered=videos.filter(v=>(!query||(v.title+' '+v.creator+' '+(v.summary||'')).toLowerCase().includes(query))&&(!category||v.category===category)&&(!platform||v.platform===platform)&&(!spoilerFree||!v.spoiler)&&(!savedOnly||saved.includes(v.url)));
 const feed=el('feed');feed.replaceChildren();
 if(!filtered.length){feed.append(element('div','empty','No videos match your filters yet.'));return}
 for(const v of filtered){
  const card=element('article','card'),thumb=element('button','thumb');thumb.type='button';
  if(v.platform==='YouTube' && /^[\w-]{11}$/.test(v.id)){const img=element('img');img.src='https://img.youtube.com/vi/'+v.id+'/hqdefault.jpg';img.alt='Video thumbnail';img.loading='lazy';thumb.append(img)}else thumb.textContent='▶';
  thumb.addEventListener('click',()=>play(v));card.append(thumb);
  const body=element('div','details');const creatorMeta=element('div','muted');
const creatorLink=element('a','',v.creator);
creatorLink.href='/creator/'+encodeURIComponent(v.creator.trim());
creatorMeta.append(creatorLink,document.createTextNode(' | '+v.platform));
body.append(element('h3','',v.title),creatorMeta,element('span','tag',v.category));
  if(v.spoiler)body.append(element('span','tag','Spoilers'));
  if(v.summary)body.append(element('p','',v.summary));
  const actions=element('div','actions'),watch=element('button','', 'Watch'),save=element('button','secondary',saved.includes(v.url)?'★ Saved':'☆ Save');
  watch.addEventListener('click',()=>play(v));save.addEventListener('click',()=>{saved=saved.includes(v.url)?saved.filter(x=>x!==v.url):[...saved,v.url];localStorage.setItem('vicewire_saved',JSON.stringify(saved));render()});
  actions.append(watch,save);body.append(actions);card.append(body);feed.append(card);
 }
}
function play(v){
 const panel=el('player');panel.replaceChildren();const close=element('button','secondary','Close player');close.addEventListener('click',()=>panel.replaceChildren());panel.append(close,element('h2','',v.title));
 const iframe=element('iframe');iframe.allowFullscreen=true;iframe.allow='encrypted-media; picture-in-picture';iframe.referrerPolicy='strict-origin-when-cross-origin';
 iframe.src=v.platform==='YouTube'?'https://www.youtube-nocookie.com/embed/'+v.id:'https://www.tiktok.com/embed/v2/'+v.id;
 panel.append(iframe);const p=element('p'),a=element('a','','Open original video');a.href=v.url;a.target='_blank';a.rel='noopener noreferrer';p.append(a);panel.append(p);panel.scrollIntoView({behavior:'smooth'});
}
function adminState(logged){el('loginForm').hidden=logged;el('addForm').hidden=!logged;el('adminInfo').textContent=logged?'Signed in. Video submissions are restricted to your admin account.':'Enter your administrator password.';el('adminToggle').textContent=logged?'Admin panel':'Admin login'}
async function session(){const info=await jsonFetch('/api/admin/session');csrf=info.csrf;adminState(info.authenticated)}
el('adminToggle').addEventListener('click',()=>{el('adminPanel').hidden=!el('adminPanel').hidden;el('adminPanel').scrollIntoView({behavior:'smooth'})});
for(const id of ['search','category','platform','safe'])el(id).addEventListener(id==='search'?'input':'change',render);
el('savedButton').addEventListener('click',()=>{savedOnly=!savedOnly;el('savedButton').classList.toggle('active',savedOnly);render()});
el('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{const data=await jsonFetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:el('adminPassword').value})});el('adminPassword').value='';csrf=data.csrf;adminState(true);el('adminStatus').textContent='Signed in.'}catch(err){el('adminStatus').textContent=err.message}});
el('logout').addEventListener('click',async()=>{await jsonFetch('/api/admin/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});csrf=null;adminState(false);el('adminStatus').textContent='Signed out.'});
el('addForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const data=Object.fromEntries(f.entries());data.spoiler=f.has('spoiler');try{await jsonFetch('/api/videos',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(data)});e.target.reset();el('adminStatus').textContent='Video added.';await load()}catch(err){el('adminStatus').textContent=err.message}});
Promise.all([load(),session()]).catch(err=>{el('adminStatus').textContent=err.message});
