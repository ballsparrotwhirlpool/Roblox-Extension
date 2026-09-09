console.log("Roblox Server Navigator loaded!");

const PAGE_SIZE = 12;
const API_SIZE = 100;
const AUTO_TOTAL_LIMIT = 100;

const runtimeMessage = (message) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if (!response?.success) return reject(new Error(response?.error || "Roblox request failed."));
    resolve(response);
  });
});

function placeId() {
  return location.pathname.match(/^\/games\/(\d+)/)?.[1] || null;
}

function findNativeServersSection() {
  const heading = [...document.querySelectorAll("h1,h2,h3,h4,div,span")].find(
    (node) => node.children.length === 0 && node.textContent.trim() === "Other Servers"
  );
  if (!heading) return null;
  let node = heading.parentElement;
  for (let i = 0; node && i < 10; i += 1, node = node.parentElement) {
    if ([...node.querySelectorAll("button,a,[role='button']")].some(
      (button) => button.textContent.trim() === "Load More"
    )) return node;
  }
  return null;
}

function addStyles() {
  if (document.querySelector("#rsn-styles")) return;
  const style = document.createElement("style");
  style.id = "rsn-styles";
  style.textContent = `
    #rsn-browser { margin: 24px 0; color: #f2f4f5; }
    #rsn-browser * { box-sizing: border-box; }
    .rsn-header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }
    .rsn-header h2 { margin:0; font-size:22px; }
    .rsn-status { color:#b8b8b8; font-size:13px; text-align:right; }
    .rsn-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
    .rsn-card { min-height:245px; padding:12px; border-radius:8px; background:#272930; display:flex; flex-direction:column; gap:8px; }
    .rsn-avatars { display:grid; grid-template-columns:repeat(3,52px); gap:7px; min-height:111px; }
    .rsn-avatar { width:52px; height:52px; border-radius:50%; overflow:hidden; display:grid; place-items:center; background:#41444e; }
    .rsn-avatar img { width:100%; height:100%; object-fit:cover; }
    .rsn-more { background:#73798b; font-weight:700; }
    .rsn-count { font-weight:700; }
    .rsn-bar { height:5px; overflow:hidden; border:1px solid #6b6e78; border-radius:4px; background:#15161a; }
    .rsn-bar span { display:block; height:100%; background:#d6d8df; }
    .rsn-id { overflow:hidden; color:#b8b8b8; font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
    .rsn-join,.rsn-button { border:0; border-radius:8px; background:#3b3e48; color:#fff; cursor:pointer; font-weight:700; }
    .rsn-join { margin-top:auto; padding:8px; }
    .rsn-button { min-width:42px; height:38px; padding:0 12px; }
    .rsn-join:hover,.rsn-button:hover { background:#4a4e5a; }
    .rsn-button:disabled { opacity:.45; cursor:default; }
    .rsn-pager { display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:8px; margin-top:16px; padding:11px; border-radius:8px; background:#272930; }
    .rsn-label { min-width:110px; text-align:center; font-weight:700; }
    .rsn-input { width:70px; height:38px; padding:0 9px; border:1px solid #5b5e68; border-radius:8px; background:#17181c; color:#fff; }
    .rsn-empty { grid-column:1/-1; padding:35px; text-align:center; color:#b8b8b8; }
    @media(max-width:900px){.rsn-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
    @media(max-width:540px){.rsn-grid{grid-template-columns:1fr;}}
  `;
  document.head.appendChild(style);
}

function createBrowser(nativeSection) {
  if (document.querySelector("#rsn-browser") || !placeId()) return;
  addStyles();
  nativeSection.style.display = "none";
  nativeSection.dataset.rsnHidden = "true";

  const root = document.createElement("section");
  root.id = "rsn-browser";
  root.innerHTML = `
    <div class="rsn-header"><h2>Other Servers</h2><span class="rsn-status"></span></div>
    <div class="rsn-grid"></div>
    <div class="rsn-pager">
      <button class="rsn-button" data-action="first">First</button>
      <button class="rsn-button" data-action="previous-100" title="Back 100 pages">&lt;&lt;&lt;</button>
      <button class="rsn-button" data-action="previous-10" title="Back 10 pages">&lt;&lt;</button>
      <button class="rsn-button" data-action="previous" title="Back 1 page">&lt;</button>
      <span class="rsn-label">Page 1 of …</span>
      <button class="rsn-button" data-action="next" title="Forward 1 page">&gt;</button>
      <button class="rsn-button" data-action="next-10" title="Forward 10 pages">&gt;&gt;</button>
      <button class="rsn-button" data-action="next-100" title="Forward 100 pages">&gt;&gt;&gt;</button>
      <button class="rsn-button" data-action="last">Last</button>
      <input class="rsn-input" type="number" min="1" step="1" value="1" aria-label="Page number">
      <button class="rsn-button" data-action="go">Go</button>
      <button class="rsn-button" data-action="refresh">Refresh total</button>
    </div>`;
  nativeSection.insertAdjacentElement("beforebegin", root);

  const grid = root.querySelector(".rsn-grid");
  const status = root.querySelector(".rsn-status");
  const label = root.querySelector(".rsn-label");
  const input = root.querySelector(".rsn-input");
  const buttons = [...root.querySelectorAll("button")];
  const thumbnails = new Map();
  const pending = new Set();
  const totalKey = `rsn-total-${placeId()}`;
  const state = { servers:[], cursor:null, ended:false, page:1, total:null, capped:false, loading:false };
  let batchPromise = null;

  function pageCount() { return Math.max(1, Math.ceil(state.servers.length / PAGE_SIZE)); }
  function setBusy(value, text="") {
    state.loading = value; status.textContent = text;
    buttons.forEach((button) => button.disabled = value);
  }

  async function hydrate(tokens) {
    const missing = [...new Set(tokens)].filter((token) => !thumbnails.has(token) && !pending.has(token));
    if (!missing.length) return;
    missing.forEach((token) => pending.add(token));
    try {
      const result = await runtimeMessage({ type:"GET_PLAYER_THUMBNAILS", tokens:missing });
      // A missing URL can mean Roblox is still generating the thumbnail. Only
      // cache completed results so a later render can retry unresolved avatars.
      missing.forEach((token) => {
        if (result.thumbnails[token]) thumbnails.set(token, result.thumbnails[token]);
      });
      render();
    } catch (error) { console.warn(error); }
    finally { missing.forEach((token) => pending.delete(token)); }
  }

  function render() {
    const totalText = state.capped
      ? `${Math.max(AUTO_TOTAL_LIMIT, Math.ceil(state.page / AUTO_TOTAL_LIMIT) * AUTO_TOTAL_LIMIT)}+`
      : state.total ?? "…";
    label.textContent = `Page ${state.page} of ${totalText}`;
    input.value = state.page;
    root.querySelector('[data-action="first"]').disabled = state.loading || state.page === 1;
    root.querySelector('[data-action="previous"]').disabled = state.loading || state.page === 1;
    root.querySelector('[data-action="previous-10"]').disabled = state.loading || state.page === 1;
    root.querySelector('[data-action="previous-100"]').disabled = state.loading || state.page === 1;
    const atLastPage = state.ended && state.page >= pageCount();
    root.querySelector('[data-action="next"]').disabled = state.loading || atLastPage;
    root.querySelector('[data-action="next-10"]').disabled = state.loading || atLastPage;
    root.querySelector('[data-action="next-100"]').disabled = state.loading || atLastPage;
    const visible = state.servers.slice((state.page-1)*PAGE_SIZE, state.page*PAGE_SIZE);
    grid.replaceChildren();
    if (!visible.length) {
      const empty=document.createElement("div"); empty.className="rsn-empty";
      empty.textContent=state.loading?"Loading servers…":"No public servers found."; grid.appendChild(empty); return;
    }
    const tokens=[];
    visible.forEach((server) => {
      const card=document.createElement("article"); card.className="rsn-card";
      const avatars=document.createElement("div"); avatars.className="rsn-avatars";
      const shown=(server.playerTokens||[]).slice(0,5);
      shown.forEach((token) => {
        tokens.push(token); const circle=document.createElement("div"); circle.className="rsn-avatar";
        const url=thumbnails.get(token); if(url){const img=document.createElement("img");img.src=url;img.alt="Player avatar";circle.appendChild(img);}
        avatars.appendChild(circle);
      });
      const remaining=Math.max(0,server.playing-shown.length);
      if(remaining){const more=document.createElement("div");more.className="rsn-avatar rsn-more";more.textContent=`+${remaining}`;avatars.appendChild(more);}
      const count=document.createElement("div");count.className="rsn-count";count.textContent=`${server.playing} of ${server.maxPlayers} people max`;
      const bar=document.createElement("div");bar.className="rsn-bar";const fill=document.createElement("span");fill.style.width=`${Math.min(100,server.playing/server.maxPlayers*100)}%`;bar.appendChild(fill);
      const join=document.createElement("button");join.className="rsn-join";join.textContent="Join";join.onclick=()=>location.href=`roblox://experiences/start?placeId=${placeId()}&gameInstanceId=${encodeURIComponent(server.id)}`;
      const id=document.createElement("div");id.className="rsn-id";id.textContent=`ID: ${server.id}`;
      card.append(avatars,count,bar,join,id);grid.appendChild(card);
    });
    hydrate(tokens);
  }

  async function loadBatch() {
    if (batchPromise) return batchPromise;
    batchPromise = runtimeMessage({type:"GET_PUBLIC_SERVERS",placeId:placeId(),cursor:state.cursor,limit:API_SIZE})
      .then((result) => {
        state.servers.push(...result.servers);
        state.cursor=result.nextPageCursor;
        state.ended=!result.nextPageCursor;
      })
      .finally(() => { batchPromise = null; });
    return batchPromise;
  }

  function prefetchNextBatch() {
    if (state.ended || batchPromise || state.loading) return;
    const remaining = state.servers.length - state.page * PAGE_SIZE;
    if (remaining < API_SIZE) loadBatch().catch(() => {});
  }

  async function go(requested) {
    const target=Math.max(1,Math.floor(Number(requested)||1));setBusy(true,`Loading page ${target}…`);render();
    try {
      while(state.servers.length<target*PAGE_SIZE&&!state.ended) {
        await loadBatch();
        status.textContent=`Loading page ${target}… (${pageCount()} pages ready)`;
      }
      state.page=state.ended?Math.min(target,pageCount()):target;
      if(state.ended){state.total=pageCount();state.capped=false;}
      status.textContent=state.page<target?`The last page is ${state.page}.`:"";
    } catch(error){status.textContent=error.message;}
    setBusy(false,status.textContent);render();prefetchNextBatch();
  }

  async function countTotal(force=false,exact=false) {
    if(!force){const cached=await new Promise((resolve)=>chrome.storage.local.get(totalKey,(x)=>resolve(x[totalKey])));if(cached){state.total=cached.pages;state.capped=cached.capped;render();return;}}
    status.textContent=exact?"Finding last page…":"Counting pages…";
    try {const result=await runtimeMessage({type:"GET_SERVER_TOTAL",placeId:placeId(),unlimited:exact});state.total=result.pages;state.capped=result.capped;chrome.storage.local.set({[totalKey]:result});render();if(exact)await go(result.pages);}
    catch(error){status.textContent=error.message;}
  }

  root.addEventListener("click",(event)=>{
    const action=event.target.closest("button")?.dataset.action;
    if(action==="first")go(1);
    if(action==="previous-100")go(state.page-100);if(action==="previous-10")go(state.page-10);if(action==="previous")go(state.page-1);
    if(action==="next")go(state.page+1);if(action==="next-10")go(state.page+10);if(action==="next-100")go(state.page+100);
    if(action==="last")countTotal(true,true);if(action==="go")go(input.value);
    if(action==="refresh")chrome.storage.local.remove(totalKey,()=>countTotal(true,false));
  });
  input.addEventListener("keydown",(event)=>{if(event.key==="Enter")go(input.value);});
  go(1).then(()=>countTotal(false,false));
}

function initialize() { const nativeSection=findNativeServersSection(); if(nativeSection)createBrowser(nativeSection); }
initialize();
new MutationObserver(initialize).observe(document.body,{childList:true,subtree:true});
