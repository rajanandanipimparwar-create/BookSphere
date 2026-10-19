const $=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TOPICS=['Fiction','Science Fiction','Mystery','Adventure','Romance','Horror','Poetry','Drama','Philosophy','History','Science','Children','Biography','Religion','Humor','Education'];
const blank=()=>({shelf:{},bookmarks:[],highlights:[],goal:12,settings:{size:19,family:'Georgia,serif',theme:'light',line:1.75,width:680},log:{}});
// Account data is loaded from the server after login. Browser storage is only a cache.
let S=blank();
let user=null,token=localStorage.bs_token||'',saveT,timer,ttsOn=false;
const app=$('#app'),CACHE={};let LOCAL=[];
const today=()=>new Date().toISOString().slice(0,10);
const pct=e=>e.status==='done'?100:(e.pages>1?Math.round(e.page/(e.pages-1)*100):0);
const toast=t=>{const n=$('#toast');n.textContent=t;n.classList.add('on');setTimeout(()=>n.classList.remove('on'),2200)};
async function api(url,method='GET',data){
  const r=await fetch(url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Something went wrong');return j;
}
function persist(){
  // Do not keep a shared cross-account copy of private reading progress in localStorage.
  if(!token)return;
  clearTimeout(saveT);
  saveT=setTimeout(()=>api('/api/state','PUT',S).catch(()=>{}),800);
}
function acct(){$('#acct').innerHTML=user?`<a class="btn sm" href="#/dashboard">${esc(user.name.split(' ')[0])}</a> <button class="btn sm ghost" onclick="logout()">Logout</button>`:`<a href="#/login" style="margin-right:10px">Login</a><a class="btn sm" href="#/register">Register</a>`}
async function logout(){
  const oldToken=token;
  clearTimeout(saveT);
  stopTTS();
  token='';user=null;S=blank();
  localStorage.removeItem('bs_token');
  localStorage.removeItem('bs_state');
  // Revoke the session on the server too; local logout still completes if offline.
  try{
    if(oldToken) await fetch('/api/logout',{method:'POST',headers:{Authorization:'Bearer '+oldToken}});
  }catch{}
  acct();location.hash='#/';route();toast('Logged out');
}
function stopTTS(){ttsOn=false;if(window.speechSynthesis)speechSynthesis.cancel()}

/* ---------- cards & catalog ---------- */
const card=b=>{const e=S.shelf[b.id];CACHE[b.id]=b;return `<div class=card><a href="#/read/${b.id}" class=cv><span>${esc(b.title)}</span>${b.cover?`<img src="${esc(b.cover)}" loading=lazy onerror="this.remove()">`:''}</a><h4>${esc(b.title)}</h4><p>${esc(b.author)}</p><small class=tag>${esc(b.topic||'Free to read')}</small>${e?`<div class=bar><i style="width:${pct(e)}%"></i></div>`:''}<div class=row><a class=btn href="#/read/${b.id}">${e&&e.page?'Continue':'Read free'}</a><button class="btn ghost" title="Read later" onclick="shelf('${b.id}','want')">＋</button></div></div>`};
function shelf(id,st){const b=CACHE[id]||{};const e=S.shelf[id]||{page:0,pages:0,added:Date.now()};S.shelf[id]={...e,status:st,meta:{id,title:b.title,author:b.author,cover:b.cover}};persist();toast('Added to your reading list')}
async function loadGrid(sel,q='',topic='',pg=1){
  const g=$(sel);let d;
  try{d=await api(`/api/catalog?search=${encodeURIComponent(q)}&topic=${encodeURIComponent(topic)}&page=${pg}`)}
  catch{d={results:LOCAL,next:false,offline:true}}
  g.innerHTML=(d.offline?'<p class=note>Offline mode: showing the built-in books. Connect to the internet for the full free library.</p>':'')+(d.results.map(card).join('')||'<p class=note>No books found. Try another word or category.</p>');return d;
}

/* ---------- pages ---------- */
async function home(){
  app.innerHTML=`<section class=hero><div><h1>Escape Into Stories &amp; Discover Your World. </h1><p>From unforgettable classics to hidden literary gems, find the stories that move you, ideas that inspire you, and adventures that never end.</p>
  <form class=big onsubmit="location.hash='#/browse?q='+encodeURIComponent(this.q.value);return false"><input name=q placeholder="Search by title, author or topic"><button>Search</button></form>
  <div class=feats><span>🖍 Highlights &amp; notes</span><span>🔖 Bookmarks</span><span>📊 Pages left &amp; goals</span><span>🔊 Read aloud</span></div></div></section>
  <section class=wrap>${Object.values(S.shelf).some(e=>e.status==='reading')?'<h2>Continue reading</h2><div class=grid id=cont></div>':''}<h2>Popular free books</h2><div class=grid id=pop><p class=note>Loading…</p></div>
  <h2>Browse by category</h2><div class=cats>${TOPICS.map(t=>`<a href="#/browse?topic=${encodeURIComponent(t)}">${t}</a>`).join('')}</div></section>`;
  const c=$('#cont');if(c)c.innerHTML=Object.values(S.shelf).filter(e=>e.status==='reading').slice(0,6).map(e=>card(e.meta)).join('');
  loadGrid('#pop', '', '', 1, 5);
}
async function browse(_,p){
  const topic=p.get('topic')||'',q=p.get('q')||'',pg=+p.get('page')||1;
  app.innerHTML=`<div class="wrap browse"><aside><h3>Categories</h3>${['All',...TOPICS].map(t=>`<a class="${(t==='All'&&!topic)||t===topic?'on':''}" href="#/browse?topic=${t==='All'?'':encodeURIComponent(t)}">${t}</a>`).join('')}</aside><main><h2 style="margin-top:0">${esc(topic||(q?'Results for "'+q+'"':'All free books'))}</h2><div class=grid id=g><p class=note>Loading…</p></div><div class=pager id=pgr></div></main></div>`;
  const d=await loadGrid('#g',q,topic,pg),base=`#/browse?q=${encodeURIComponent(q)}&topic=${encodeURIComponent(topic)}&page=`;
  const pager = $('#pgr');
  if (!pager || !pager.isConnected) return;
  pager.innerHTML=(pg>1?`<a class="btn ghost" href="${base+(pg-1)}">‹ Previous</a>`:'')+(d.next?`<a class=btn href="${base+(pg+1)}">Next ›</a>`:'');
}
function dashboard(){
  const all=Object.entries(S.shelf).map(([id,e])=>({id,...e})),by=s=>all.filter(e=>e.status===s);
  const left=by('reading').reduce((a,e)=>a+Math.max(0,(e.pages||1)-1-e.page),0);
  let streak=0;for(let i=0;i<365;i++){const d=new Date();d.setDate(d.getDate()-i);if(S.log[d.toISOString().slice(0,10)]>0)streak++;else if(i>0)break}
  const done=by('done').length;
  const row=e=>`<tr><td><a href="#/read/${e.id}"><b>${esc(e.meta.title)}</b></a><br><small>${esc(e.meta.author)}</small></td><td><select onchange="setStatus('${e.id}',this.value)">${[['reading','Reading'],['want','Pending (read later)'],['done','Finished']].map(([v,l])=>`<option value=${v} ${e.status===v?'selected':''}>${l}</option>`).join('')}</select></td><td><div class=bar><i style="width:${pct(e)}%"></i></div>${pct(e)}%</td><td>${e.pages?Math.max(0,e.pages-1-e.page):'-'} pages</td><td><a class="btn sm" href="#/read/${e.id}">${e.page?'Continue':'Start'}</a> <button class="btn sm red" onclick="removeBook('${e.id}')">✕</button></td></tr>`;
  app.innerHTML=`<div class=wrap><h2 style="margin-top:0">${user?'Welcome back, '+esc(user.name):'My Library'}</h2>${user?'':'<p><a href="#/register"><b>Create a free account</b></a> to save your progress, bookmarks and highlights on every device. Right now they are saved in this browser only.</p>'}
  <div class=stats><div class=stat><b>${by('reading').length}</b><span>Reading now</span></div><div class=stat><b>${by('want').length}</b><span>Pending (read later)</span></div><div class=stat><b>${left}</b><span>Pages left in current books</span></div><div class=stat><b>${done}/${S.goal}</b><span>Finished vs yearly goal <a href="#" onclick="setGoal();return false">✎</a></span></div><div class=stat><b>${Math.round(S.log[today()]||0)}m</b><span>Read today</span></div><div class=stat><b>${streak}🔥</b><span>Day streak</span></div></div>
  <h2>My books</h2>${all.length?`<table><tr><th>Book</th><th>Status</th><th>Progress</th><th>Left</th><th></th></tr>${all.sort((a,b)=>(b.updated||0)-(a.updated||0)).map(row).join('')}</table>`:'<p>No books yet. <a href="#/browse"><b>Browse the free library</b></a> and press Read free.</p>'}
  <h2>Bookmarks (${S.bookmarks.length})</h2>${S.bookmarks.map(b=>`<div class=item><a href="#/read/${b.bid}?page=${b.page}"><b>${esc(b.title)}</b> <small>page ${b.page+1} ${esc(b.note||'')}</small></a></div>`).join('')||'<p>Press 🔖 inside a book to save a page.</p>'}
  <h2>Highlights (${S.highlights.length}) ${S.highlights.length?'<button class="btn sm ghost" onclick="exportHl()">Export</button>':''}</h2>${S.highlights.slice().reverse().map(h=>`<div class=item><a href="#/read/${h.bid}?para=${h.p}"><mark class="h-${h.c}">${esc(h.text)}</mark><br><small>${esc(h.title)} ${h.note?'· 📝 '+esc(h.note):''}</small></a></div>`).join('')||'<p>Select text inside a book to highlight it.</p>'}</div>`;
}
function setStatus(id,s){S.shelf[id].status=s;persist();dashboard()}
function removeBook(id){delete S.shelf[id];persist();dashboard()}
function setGoal(){const g=+prompt('How many books do you want to finish this year?',S.goal);if(g>0){S.goal=g;persist();dashboard()}}
function exportHl(){const t=S.highlights.map(h=>`"${h.text}"\n— ${h.title}${h.note?'\nNote: '+h.note:''}\n`).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:'text/plain'}));a.download='my-highlights.txt';a.click()}


async function loadGrid(sel, q = '', topic = '', pg = 1, limit = 0) {
  const g = $(sel);
  let d;

  try {
    d = await api(
      `/api/catalog?search=${encodeURIComponent(q)}&topic=${encodeURIComponent(topic)}&page=${pg}`
    );
  } catch {
    d = { results: LOCAL, next: false, offline: true };
  }

  const results = limit > 0 ? d.results.slice(0, limit) : d.results;

  if (!g || !g.isConnected) return d;
  g.innerHTML =
    (d.offline
      ? '<p class=note>Offline mode: showing the built-in books. Connect to the internet for the full free library.</p>'
      : '') +
    (results.map(card).join('') ||
      '<p class=note>No books found. Try another word or category.</p>');

  return d;
}


/* ---------- login and registration ---------- */
function authPage(kind){
  const reg = kind === 'register';
  app.innerHTML = `<div class="box auth-box">
    <h2 style="margin-top:0">${reg ? 'Create your BookSphere account' : 'Welcome back'}</h2>
    <p class="auth-intro">${reg ? 'Create an account to save your reading progress.' : 'Log in to continue your reading journey.'}</p>
    <form id="af">
      ${reg ? '<label>Full name<input name="name" autocomplete="name" required minlength="2"></label>' : ''}
      <label>Email address<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="6" required></label>
      <p class="err" id="ae" role="alert"></p>
      <button class="btn auth-submit" type="submit">${reg ? 'Create account' : 'Login'}</button>
    </form>
    <p class="auth-switch">${reg ? 'Already have an account?' : 'New to BookSphere?'} <a href="#/${reg ? 'login' : 'register'}"><b>${reg ? 'Login' : 'Register'}</b></a></p>
  </div>`;
  const form = $('#af');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const err = $('#ae');
    button.disabled = true;
    button.textContent = reg ? 'Creating account…' : 'Logging in…';
    err.textContent = '';
    try {
      const payload = Object.fromEntries(new FormData(form));
      const result = await api('/api/' + kind, 'POST', payload);
      token = result.token;
      localStorage.setItem('bs_token', token);
      user = { name: result.name, email: result.email };
      S = blank();
      try {
        const me = await api('/api/me');
        S = Object.assign(blank(), me.state && typeof me.state === 'object' ? me.state : {});
      } catch (e) {
        // Account is valid even if reading-progress sync is temporarily unavailable.
      }
      localStorage.removeItem('bs_state');
      acct();
      location.hash = '#/dashboard';
      toast(reg ? 'Account created successfully!' : 'Welcome back, ' + result.name);
    } catch (e) {
      err.textContent = e.message || 'Unable to continue. Please try again.';
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = reg ? 'Create account' : 'Login';
      }
    }
  });
}

async function market(){
  app.innerHTML=`<div class=wrap><h2 style="margin-top:0">Buy &amp; Sell Books</h2>${user?`<form class=form id=lf><label>Title<input name=title required></label><label>Author<input name=author></label><label>Price (₹)<input name=price type=number min=0></label><label>Condition<select name=cond><option>Like new</option><option selected>Good</option><option>Fair</option></select></label><label>City<input name=city></label><label>Phone or email<input name=contact required></label><button class=btn>List my book</button></form>`:'<p><a href="#/login"><b>Login</b></a> to sell a book.</p>'}<div id=ls><p class=load>Loading…</p></div></div>`;
  const show=L=>{$('#ls').innerHTML=L.map(l=>`<div class=item><div><b>${esc(l.title)}</b> ${esc(l.author)}<br><small>₹${l.price} · ${esc(l.cond)} · ${esc(l.city)} · sold by ${esc(l.seller)}</small></div><div><a class="btn sm" href="${l.contact.includes('@')?'mailto:':'tel:'}${esc(l.contact)}">Contact seller</a> ${user&&user.email===l.owner?`<button class="btn sm red" onclick="delListing(${l.id})">Remove</button>`:''}</div></div>`).join('')||'<p>No books listed yet. Be the first to sell one.</p>'};
  window.showL=show;try{show(await api('/api/listings'))}catch{show([])}
  const f=$('#lf');if(f)f.onsubmit=async ev=>{ev.preventDefault();try{show(await api('/api/listings','POST',Object.fromEntries(new FormData(f))));f.reset();toast('Listed')}catch(e){toast(e.message)}};
}
async function delListing(id){showL(await api('/api/listings/'+id,'DELETE'))}

/* ---------- reader ---------- */
async function read(id,params){
  app.innerHTML='<div class=load>Opening book…</div>';
  let meta=CACHE[id]||(S.shelf[id]&&S.shelf[id].meta),text;
  try{const l=LOCAL.find(b=>b.id==id);if(l){meta=l;text=l.text}else{const r=await api('/api/text/'+id);meta=r.meta;text=r.text}}
  catch(e){app.innerHTML=`<div class=load>Could not open this book: ${esc(e.message)}.<br>Check your internet connection and that the server is running.<br><a class=btn href="#/browse">Back to library</a></div>`;return}
  const paras=text.split(/\n\s*\n/).map(p=>p.replace(/\s*\n\s*/g,' ').trim()).filter(Boolean);
  const pages=[];let cur=[],n=0;paras.forEach((p,i)=>{if(n>0&&n+p.length>2200){pages.push(cur);cur=[];n=0}cur.push(i);n+=p.length});if(cur.length)pages.push(cur);
  const pageOf=[];pages.forEach((a,k)=>a.forEach(i=>pageOf[i]=k));
  const toc = [];
paras.forEach((p, i) => {
  if (
    p.length < 70 &&
    /^(chapter|book|part|act|canto|stave|letter|volume|section|[ivxlc]+\.?)(\s|$)/i.test(p)
  ) {
    toc.push({ i, t: p });
  }
});
  const e=S.shelf[id]=Object.assign({page:0,added:Date.now()},S.shelf[id],{meta:{id,title:meta.title,author:meta.author,cover:meta.cover},pages:pages.length});
  if(!e.status||e.status==='want')e.status='reading';
  let pg=Math.min(e.page||0,pages.length-1),tab='',sel=null;
  if(params.get('page'))pg=+params.get('page');if(params.get('para'))pg=pageOf[+params.get('para')]||0;
  const st=S.settings,mine=a=>a.filter(x=>String(x.bid)===String(id));
  app.innerHTML=`<div class="reader" id=rd><div class=rtop><a href="#/dashboard" class=rtb>←</a><b class=rt>${esc(meta.title)}</b><span class=sp></span><button id=bmb onclick="R.bm()" title="Bookmark this page">🔖</button><button onclick="R.tts()" title="Read aloud">🔊</button><button onclick="R.panel('toc')" title="Chapters and notes">☰</button><button onclick="R.panel('set')" title="Text settings">Aa</button></div>
  <div class=rbody><article id=txt></article><aside id=pn class="pn hide"></aside></div><div class=rbot><button onclick="R.go(-1)">‹ Prev</button><input type=range id=sl min=1 max=${pages.length} oninput="R.jump(this.value-1)"><button onclick="R.go(1)">Next ›</button><span id=pc></span></div><div id=readerPop class=hide onmousedown="event.preventDefault()"></div></div>`;
  const hl=i=>{const hs=mine(S.highlights).filter(h=>h.p===i).sort((a,b)=>a.s-b.s),s=paras[i];let o='',c=0;hs.forEach(h=>{if(h.s<c)return;o+=esc(s.slice(c,h.s))+`<mark class="h-${h.c}" data-h="${h.t}" ${h.note?`title="${esc(h.note)}"`:''}>${esc(s.slice(h.s,h.e))}</mark>`;c=h.e});return o+esc(s.slice(c))};
  const style=()=>{const t=$('#txt');$('#rd').className='reader t-'+st.theme;t.style.fontSize=st.size+'px';t.style.fontFamily=st.family;t.style.lineHeight=st.line;t.style.setProperty('--w',st.width+'px')};
  const draw=()=>{
    $('#txt').innerHTML=pages[pg].map(i=>{const h=toc.some(x=>x.i===i)?'h3':'p';return `<${h} data-i=${i}>${hl(i)}</${h}>`}).join('');$('#txt').scrollTop=0;
    $('#sl').value=pg+1;$('#pc').textContent=`Page ${pg+1}/${pages.length} · ${pages.length-1-pg} left`;
    e.page=pg;e.updated=Date.now();if(pg===pages.length-1&&pages.length>1&&e.status!=='done'){e.status='done';toast('Finished! 🎉 Added to your finished books')}
    $('#bmb').style.background=S.bookmarks.some(b=>String(b.bid)===String(id)&&b.page===pg)?'#ffd84d66':'';persist();
  };
  const panel=t=>{tab=(tab===t?'':t);const p=$('#pn');if(!tab){p.classList.add('hide');return}p.classList.remove('hide');
    const tabs=[['toc','Chapters'],['marks','Marks'],['find','Search'],['set','Aa']].map(([k,l])=>`<button class="tb ${tab===k?'on':''}" onclick="R.panel('${k}',1)">${l}</button>`).join('');
    let b='';
    if(tab==='toc')b=toc.map(x=>`<div class=it onclick="R.jump(${pageOf[x.i]})">${esc(x.t)}<small>page ${pageOf[x.i]+1}</small></div>`).join('')||'<p>No chapters detected. Use the page slider below.</p>';
    if(tab==='marks')b='<b>Bookmarks</b>'+(mine(S.bookmarks).map(x=>`<div class=it onclick="R.jump(${x.page})">Page ${x.page+1} ${esc(x.note||'')}<small onclick="event.stopPropagation();R.delBm(${x.t})">remove</small></div>`).join('')||'<p>None yet.</p>')+'<b>Highlights</b>'+(mine(S.highlights).map(x=>`<div class=it onclick="R.jump(${pageOf[x.p]})"><mark class="h-${x.c}">${esc(x.text.slice(0,120))}</mark>${x.note?'<small>📝 '+esc(x.note)+'</small>':''}</div>`).join('')||'<p>Select text to highlight.</p>');
    if(tab==='find')b='<input type=search id=fq placeholder="Search in this book" onkeydown="if(event.key===\'Enter\')R.find(this.value)"><div id=fr></div>';
    if(tab==='set')b=`<p>Text size <input type=range min=14 max=34 value=${st.size} oninput="R.set('size',+this.value)"></p><p>Line spacing <input type=range min=1.3 max=2.4 step=.05 value=${st.line} oninput="R.set('line',+this.value)"></p><p>Page width <input type=range min=420 max=1000 step=20 value=${st.width} oninput="R.set('width',+this.value)"></p><p>Font <select onchange="R.set('family',this.value)">${[['Georgia,serif','Serif'],['system-ui,sans-serif','Sans'],['"Courier New",monospace','Typewriter']].map(([v,l])=>`<option value='${v}' ${st.family===v?'selected':''}>${l}</option>`).join('')}</select></p><p>Theme <button class=tb onclick="R.set('theme','light')">Light</button> <button class=tb onclick="R.set('theme','sepia')">Sepia</button> <button class=tb onclick="R.set('theme','dark')">Dark</button></p>`;
    p.innerHTML=`<div class=tabs>${tabs}</div>${b}`;if(tab==='find')$('#fq').focus();
  };
  const popup=(x,y,html)=>{const p=$('#readerPop');p.innerHTML=html;p.classList.remove('hide');p.style.left=Math.max(8,Math.min(innerWidth-300,x))+'px';p.style.top=Math.max(70,y)+'px'};
  const closePop=()=>$('#readerPop').classList.add('hide');
  const redraw=i=>{const el=$(`[data-i="${i}"]`);if(el)el.innerHTML=hl(i)};
  window.R={
    go:d=>{const k=pg+d;if(k>=0&&k<pages.length){pg=k;draw()}},jump:k=>{pg=Math.max(0,Math.min(pages.length-1,+k));draw()},panel,
    set:(k,v)=>{st[k]=v;style();persist()},
    bm:()=>{const i=S.bookmarks.findIndex(b=>String(b.bid)===String(id)&&b.page===pg);if(i>=0){S.bookmarks.splice(i,1);toast('Bookmark removed')}else{S.bookmarks.push({bid:id,title:meta.title,page:pg,note:(prompt('Add a note (optional)')||''),t:Date.now()});toast('Page bookmarked')}draw();if(tab==='marks')panel('marks')},
    delBm:t=>{S.bookmarks=S.bookmarks.filter(b=>b.t!==t);persist();draw();tab='marks';panel('marks')},
    find:q=>{q=q.toLowerCase();const r=[];paras.forEach((p,i)=>{const k=p.toLowerCase().indexOf(q);if(q&&k>=0&&r.length<60)r.push(`<div class=it onclick="R.jump(${pageOf[i]})">${esc(p.slice(Math.max(0,k-40),k+80))}…<small>page ${pageOf[i]+1}</small></div>`)});$('#fr').innerHTML=r.join('')||'<p>No matches.</p>'},
    tts:()=>{if(ttsOn){stopTTS();toast('Stopped');return}ttsOn=true;const u=new SpeechSynthesisUtterance($('#txt').innerText);u.onend=()=>{if(ttsOn&&pg<pages.length-1){R.go(1);ttsOn=false;R.tts()}else ttsOn=false};speechSynthesis.speak(u)},
    hl:c=>{const h={bid:id,title:meta.title,p:sel.p,s:sel.s,e:sel.e,c,text:sel.text,note:'',t:Date.now()};S.highlights.push(h);getSelection().removeAllRanges();closePop();redraw(sel.p);persist()},
    note:()=>{const n=prompt('Your note');if(n==null)return;R.hl('y');S.highlights[S.highlights.length-1].note=n;redraw(sel.p);persist()},
    rm:t=>{S.highlights=S.highlights.filter(h=>h.t!==t);closePop();draw()},
    noteH:t=>{const h=S.highlights.find(x=>x.t===t),n=prompt('Note',h.note||'');if(n!=null){h.note=n;persist();closePop();draw()}},
    def:async()=>{const w=sel.text.trim().split(/\s+/)[0].replace(/[^\w'-]/g,'');popup(innerWidth/2-150,120,'Looking up…');try{const d=(await (await fetch('https://api.dictionaryapi.dev/v2/entries/en/'+w)).json())[0].meanings[0];popup(innerWidth/2-150,120,`<div style="padding:6px"><b>${esc(w)}</b> <i>${esc(d.partOfSpeech)}</i><br>${esc(d.definitions[0].definition)}</div>`)}catch{popup(innerWidth/2-150,120,'<div style="padding:6px">No definition found (needs internet).</div>')}}
  };
  $('#txt').addEventListener('mouseup',ev=>setTimeout(()=>{
    const m=ev.target.closest&&ev.target.closest('mark[data-h]'),s=getSelection();
    if(m&&s.isCollapsed){const t=+m.dataset.h;popup(ev.clientX-60,ev.clientY-50,`<button onclick="R.noteH(${t})">📝 Note</button><button onclick="R.rm(${t})">🗑 Remove</button>`);return}
    if(!s||s.isCollapsed||!s.toString().trim()){closePop();return}
    const r=s.getRangeAt(0),el=x=>(x.nodeType===3?x.parentElement:x).closest('[data-i]'),a=el(r.startContainer),b=el(r.endContainer);
    if(!a||a!==b){toast('Highlight one paragraph at a time');return}
    const pre=document.createRange();pre.selectNodeContents(a);pre.setEnd(r.startContainer,r.startOffset);
    const so=pre.toString().length;sel={p:+a.dataset.i,s:so,e:so+r.toString().length,text:r.toString().trim()};
    const bb=r.getBoundingClientRect();
    popup(bb.left,bb.top-48,['y','g','b','p'].map(c=>`<button class="dot h-${c}" onclick="R.hl('${c}')"></button>`).join('')+'<button onclick="R.note()">📝</button><button onclick="R.def()">Define</button>');
  },10));
  document.onkeydown=ev=>{if(/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName))return;if(ev.key==='ArrowRight')R.go(1);if(ev.key==='ArrowLeft')R.go(-1)};
  timer=setInterval(()=>{if(!document.hidden){S.log[today()]=(S.log[today()]||0)+.5;persist()}},30000);
  style();draw();
}

/* ---------- router ---------- */
function route(){
  const [p,q]=(location.hash.slice(2)||'').split('?'),[page,arg]=p.split('/'),params=new URLSearchParams(q||'');
  stopTTS();clearInterval(timer);document.onkeydown=null;window.scrollTo(0,0);
  const pages={'':home,browse,read,dashboard,login:()=>authPage('login'),register:()=>authPage('register'),market};
  (pages[page]||home)(arg,params);
}
(async()=>{
  try{LOCAL=await (await fetch('books.json')).json()}catch{}
  if(token){
    try{
      const me=await api('/api/me');
      user={name:me.name,email:me.email};
      S=Object.assign(blank(),me.state&&typeof me.state==='object'?me.state:{});
      localStorage.removeItem('bs_state');
    }catch{
      token='';user=null;S=blank();
      localStorage.removeItem('bs_token');localStorage.removeItem('bs_state');
    }
  }else{
    // Guest mode must not inherit a previous account's private library data.
    S=blank();localStorage.removeItem('bs_state');
  }
  acct();addEventListener('hashchange',route);route();
})();
