// Class Queue: everyone searches and adds songs, the host plays them.

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

// ---------- Icons ----------

const I = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 1.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zM12.9 7v4.1H17v1.8h-4.1V17h-1.8v-4.1H7v-1.8h4.1V7z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm4.3 6.3-5.6 5.6-2.9-2.9-1.4 1.4 4.3 4.3 7-7z"/></svg>',
  plusBare: '<svg viewBox="0 0 24 24"><path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>',
  checkBare: '<svg viewBox="0 0 24 24"><path d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20.3 10.6 19C5.4 14.3 2 11.2 2 7.5 2 4.4 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 2C19.6 2 22 4.4 22 7.5c0 3.7-3.4 6.8-8.6 11.5zM7.5 4C5.5 4 4 5.5 4 7.5c0 2.8 3 5.6 8 10.1 5-4.5 8-7.3 8-10.1C20 5.5 18.5 4 16.5 4c-1.5 0-3 1-3.6 2.4h-1.8C10.5 5 9 4 7.5 4z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24"><path d="M12 20.3 10.6 19C5.4 14.3 2 11.2 2 7.5 2 4.4 4.4 2 7.5 2c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 2C19.6 2 22 4.4 22 7.5c0 3.7-3.4 6.8-8.6 11.5z"/></svg>',
  more: '<svg viewBox="0 0 24 24"><path d="M5 10.3a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm7 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4zm7 0a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4z"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 5.5v13l9-6.5zM16 5h2.5v14H16z"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7zm2.2 2 .7 8h6.2l.7-8z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m12 7 7 7-1.4 1.4-5.6-5.6-5.6 5.6L5 14z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m12 17-7-7 1.4-1.4 5.6 5.6 5.6-5.6L19 10z"/></svg>',
  top: '<svg viewBox="0 0 24 24"><path d="M5 4h14v2H5zm7 4 7 7-1.4 1.4-4.6-4.6V21h-2v-9.2l-4.6 4.6L5 15z"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 11-11-1.4-1.4z"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4L15 9h2.2A6 6 0 1 0 18 14h2.1A8 8 0 1 1 12 4z"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 3v4.6l3.5 2.1-1 1.7L11 12.7V7z"/></svg>',
  user: '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm0 10c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5zm0 2c-3.3 0-5.6 1.5-6 3h12c-.4-1.5-2.7-3-6-3z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm6 10H6v8h12zm-6-8a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9z"/></svg>',
};

// ---------- Identity ----------

// Signed-in member (from /api/me) and, if unlocked, the dashboard password for host mode.
const me = { token: store.get("token", ""), id: "", name: "", username: "", adminPw: store.get("adminPw", "") };

function setUser(user, token) {
  if (token) {
    me.token = token;
    store.set("token", token);
  }
  me.id = user.id;
  me.name = user.name;
  me.username = user.username;
  store.set("hadAccount", true);
}

function signOut() {
  me.token = me.id = me.name = me.username = "";
  store.set("token", "");
  showAuth("login");
}

// ---------- App state ----------

let state = { version: -1, settings: {}, nowPlaying: null, queue: [], history: [], online: 0 };
let trending = null;
let currentView = "home";
let queueFilter = "all";
let search = { q: "", results: null, loading: false, error: "" };
const registry = new Map(); // data-key -> track or song, for event delegation
const pendingAdds = new Set();

function reg(item) {
  const key = item.id ? `s:${item.id}` : `t:${item.trackId}`;
  registry.set(key, item);
  return key;
}

function inQueue(trackId) {
  if (state.nowPlaying?.trackId === trackId) return true;
  return state.queue.some((s) => s.trackId === trackId);
}

const isHost = () => Boolean(me.adminPw);

// ---------- Network ----------

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(me.token ? { Authorization: `Bearer ${me.token}` } : {}),
      ...(me.adminPw ? { "X-Admin-Password": me.adminPw } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401) signOut();
  if (res.status === 403 && /password/i.test(data.error || "") && me.adminPw) {
    me.adminPw = "";
    store.set("adminPw", "");
    render();
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

let ws = null;
let wsBackoff = 1000;
let pingTimer = null;
let pollTimer = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
  } catch {
    startPolling();
    return;
  }
  ws.onopen = () => {
    wsBackoff = 1000;
    setLive(true);
    stopPolling();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), 25000);
  };
  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === "state") applyState(msg.state);
    } catch {}
  };
  ws.onclose = () => {
    setLive(false);
    clearInterval(pingTimer);
    startPolling();
    setTimeout(connect, wsBackoff);
    wsBackoff = Math.min(wsBackoff * 2, 15000);
  };
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(refreshState, 8000);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
}

async function refreshState() {
  try { applyState(await api("/api/state")); } catch {}
}

// After a change, the WebSocket pushes the new queue. If it's down, fetch it.
function afterMutation() {
  if (!ws || ws.readyState !== WebSocket.OPEN) refreshState();
}

function applyState(next) {
  if (next.version < state.version) return;
  state = next;
  render();
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    connect();
    refreshState();
  }
});

// ---------- Formatting ----------

function fmtDuration(ms) {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const AVATAR_COLORS = ["#e8115b", "#1e3264", "#8400e7", "#e1118c", "#148a08", "#dc148c", "#0d73ec", "#ba5d07", "#e91429", "#509bf5", "#af2896", "#27856a"];
function colorFor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function spotifyUrl(t) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${t.title} ${t.artist}`)}`;
}

const explicitBadge = (t) => (t.explicit ? '<span class="e-badge" title="Explicit">E</span>' : "");

// Average color of a cover, darkened, for Spotify-style backgrounds.
const colorCache = new Map();
function coverColor(src) {
  if (!src) return Promise.resolve(null);
  if (colorCache.has(src)) return colorCache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 8;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0, 8, 8);
        const d = g.getImageData(0, 0, 8, 8).data;
        let r = 0, gr = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4, k = 0.6;
        resolve(`rgb(${Math.round((r / n) * k)}, ${Math.round((gr / n) * k)}, ${Math.round((b / n) * k)})`);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  colorCache.set(src, p);
  return p;
}

// ---------- Rendering ----------

function render() {
  renderChrome();
  renderHome();
  renderQueue();
  if (search.results) renderSearchResults();
  refreshMiniAdd();
}

function renderChrome() {
  const count = state.queue.length;
  const badge = $("#queue-badge");
  badge.hidden = !count;
  badge.textContent = count > 99 ? "99+" : count;
  $("#online-count").textContent = state.online || 1;
  $("#host-chip").hidden = !isHost();
  $("#locked-banner").hidden = !state.settings.locked;
  const avatar = $("#avatar-btn");
  avatar.textContent = (me.name || "?").slice(0, 1);
  avatar.style.setProperty("--avatar", colorFor(me.name || "?"));
  $("#host-bar").hidden = !isHost();
  $("#next-btn").disabled = !state.queue.length && !state.nowPlaying;
}

function setLive(on) {
  $("#live-chip").classList.toggle("connected", on);
}

function greeting() {
  const h = new Date().getHours();
  const part = h < 5 ? "Hey night owl" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return me.name ? `${part}, ${me.name}` : part;
}

function renderHome() {
  $("#greeting").textContent = greeting();

  const np = state.nowPlaying;
  const nowCard = $("#now-card");
  if (np) {
    const key = reg(np);
    nowCard.innerHTML = `
      <button class="now-card" data-act="more" data-key="${key}">
        <img src="${esc(np.artwork)}" alt="">
        <div class="info">
          <div class="label"><span class="eq"><i></i><i></i><i></i></span>Now playing</div>
          <div class="t ellipsis">${esc(np.title)}</div>
          <div class="a ellipsis">${esc(np.artist)} · added by ${esc(np.addedBy)}</div>
        </div>
      </button>`;
  } else {
    nowCard.innerHTML = `
      <div class="now-card empty">
        <div class="t">${state.queue.length ? "Queue is ready to go" : "Nothing playing yet"}</div>
        <div class="a">${state.queue.length ? `${state.queue.length} song${state.queue.length === 1 ? "" : "s"} waiting.` : "Be the first to add a song."}</div>
        ${isHost() && state.queue.length
          ? `<button class="btn-green" data-act="host-next">${I.play} Start the queue</button>`
          : `<button class="btn-white" data-goto="search">Find a song</button>`}
      </div>`;
  }
  coverColor(np?.artwork).then((c) => $("#home-glow").style.setProperty("--glow", c || "#3a3a3a"));

  const up = state.queue.slice(0, 3);
  $("#home-upnext").innerHTML = up.length
    ? up.map((s, i) => queueRow(s, i + 1)).join("")
    : `<div class="empty" style="padding:18px 0">The queue is empty.</div>`;

  const shelf = $("#trending");
  if (trending === null) {
    shelf.innerHTML = Array.from({ length: 4 }, () => `<div class="tile"><div class="skeleton" style="width:140px;height:140px"></div><div class="skeleton" style="height:12px;margin-top:10px;width:80%"></div></div>`).join("");
  } else if (!trending.length) {
    shelf.innerHTML = `<div class="empty" style="padding:8px 0">Couldn't load charts. Try searching instead.</div>`;
  } else {
    shelf.innerHTML = trending.map(tile).join("");
  }

  const hist = state.history.slice(0, 12);
  $("#history-head").hidden = !hist.length;
  $("#home-history").innerHTML = hist.map(tile).join("");
}

function tile(t) {
  const key = reg(t);
  const added = inQueue(t.trackId);
  const blocked = t.explicit && state.settings.blockExplicit && !isHost();
  return `
    <div class="tile">
      <div class="art">
        <button data-act="preview" data-key="${key}" aria-label="Preview ${esc(t.title)}"><img src="${esc(t.artwork)}" alt="" loading="lazy"></button>
        ${blocked ? "" : `<button class="add-fab ${added ? "done" : ""}" data-act="add" data-key="${key}" aria-label="Add to queue">${added ? I.checkBare : I.plusBare}</button>`}
      </div>
      <button data-act="more" data-key="${key}" style="text-align:left;width:100%">
        <div class="t ellipsis">${esc(t.title)}</div>
        <div class="a ellipsis">${t.explicit ? "E · " : ""}${esc(t.artist)}</div>
      </button>
    </div>`;
}

function queueRow(s, num, opts = {}) {
  const key = reg(s);
  const liked = me.id && s.likers.includes(me.id);
  const mine = me.id && s.owner === me.id;
  return `
    <div class="row ${opts.playing ? "playing" : ""}">
      ${num ? `<span class="num">${num}</span>` : ""}
      <button data-act="preview" data-key="${key}" aria-label="Preview"><img src="${esc(s.artwork)}" alt="" loading="lazy"></button>
      <button class="main" data-act="more" data-key="${key}">
        <div class="t ellipsis">${esc(s.title)}</div>
        <div class="a">${explicitBadge(s)}<span class="ellipsis">${esc(s.artist)} · <span class="by">${mine ? "<b>you</b>" : esc(s.addedBy)}</span></span></div>
      </button>
      ${opts.noLike ? "" : `<button class="row-btn like ${liked ? "liked" : ""}" data-act="like" data-key="${key}" aria-label="${liked ? "Unlike" : "Like"}">${liked ? I.heartFill : I.heart}${s.likes ? `<span>${s.likes}</span>` : ""}</button>`}
      <button class="row-btn" data-act="more" data-key="${key}" aria-label="More options">${I.more}</button>
    </div>`;
}

function searchRow(t) {
  const key = reg(t);
  const added = inQueue(t.trackId);
  const previewing = preview.track?.trackId === t.trackId && !audio.paused;
  const blocked = t.explicit && state.settings.blockExplicit && !isHost();
  return `
    <div class="row">
      <button data-act="preview" data-key="${key}" aria-label="Preview"><img src="${esc(t.artwork)}" alt="" loading="lazy"></button>
      <button class="main" data-act="preview" data-key="${key}">
        <div class="t ellipsis ${previewing ? "previewing" : ""}">${esc(t.title)}</div>
        <div class="a">${explicitBadge(t)}<span class="ellipsis">${esc(t.artist)}${t.durationMs ? ` · ${fmtDuration(t.durationMs)}` : ""}</span></div>
      </button>
      ${blocked
        ? `<span class="row-btn" title="Explicit songs are off">${I.lock}</span>`
        : `<button class="row-btn add-btn ${added ? "done" : ""}" data-act="add" data-key="${key}" aria-label="${added ? "In queue" : "Add to queue"}">${added ? I.check : I.plus}</button>`}
      <button class="row-btn" data-act="more" data-key="${key}" aria-label="More options">${I.more}</button>
    </div>`;
}

function renderQueue() {
  const np = state.nowPlaying;
  const mode = state.settings.sort === "likes" ? "Ordered by most liked" : "First come, first served";
  $("#queue-meta").textContent = `${state.queue.length} song${state.queue.length === 1 ? "" : "s"} · ${mode}`;

  $("#queue-now").innerHTML = np
    ? `<h2 class="list-title">Now playing</h2><div class="tracklist">${queueRow(np, 0, { playing: true })}</div>`
    : "";

  let list = state.queue;
  if (queueFilter === "mine") list = list.filter((s) => s.owner === me.id);
  if (queueFilter === "liked") list = list.filter((s) => s.likers.includes(me.id));
  const positions = new Map(state.queue.map((s, i) => [s.id, i + 1]));

  $("#queue-title").hidden = !state.queue.length;
  $("#queue-list").innerHTML = list.length
    ? list.map((s) => queueRow(s, positions.get(s.id))).join("")
    : queueFilter === "all"
      ? `<div class="empty"><h3>Queue's empty</h3>Search for a song and tap + to add it.<br><button class="btn-white" data-goto="search">Find songs</button></div>`
      : `<div class="empty">${queueFilter === "mine" ? "You haven't added anything yet." : "You haven't liked anything yet."}</div>`;

  $("#queue-history-wrap").hidden = !state.history.length;
  $("#queue-history").innerHTML = state.history.map((s) => queueRow(s, 0, { noLike: true })).join("");
}

// ---------- Search ----------

const GENRES = [
  ["Pop", "pop hits", "#dc148c"], ["Hip-Hop", "hip hop", "#ba5d07"], ["Dance", "dance", "#8d67ab"],
  ["Rock", "rock", "#e91429"], ["R&B", "r&b", "#1e3264"], ["Latin", "reggaeton", "#e1118c"],
  ["K-Pop", "k-pop", "#148a08"], ["Indie", "indie", "#608108"], ["Throwbacks", "2000s hits", "#477d95"],
  ["Chill", "chill", "#503750"], ["Party", "party", "#e8115b"], ["Movies", "soundtrack", "#0d73ec"],
];

function renderSearchHome() {
  const recent = store.get("recent", []);
  $("#search-body").innerHTML = `
    ${recent.length ? `
      <div class="recent">
        <div class="section-head" style="margin:0 0 4px"><h2 style="font-size:16px">Recent searches</h2><button class="link" data-act="clear-recent">Clear</button></div>
        ${recent.map((q) => `<button class="recent-item" data-act="recent" data-q="${esc(q)}">${I.clock}<span class="ellipsis">${esc(q)}</span></button>`).join("")}
      </div>` : ""}
    <div class="browse-title">Browse all</div>
    <div class="genres">
      ${GENRES.map(([name, q, color]) => `<button class="genre" style="background:${color}" data-act="recent" data-q="${esc(q)}">${esc(name)}</button>`).join("")}
    </div>`;
}

function renderSearchResults() {
  const body = $("#search-body");
  if (search.loading && !search.results?.length) {
    body.innerHTML = Array.from({ length: 6 }, () => `<div class="row"><div class="skeleton" style="width:48px;height:48px"></div><div style="flex:1"><div class="skeleton" style="height:12px;width:60%"></div><div class="skeleton" style="height:10px;width:40%;margin-top:8px"></div></div></div>`).join("");
    return;
  }
  if (search.error) {
    body.innerHTML = `<div class="empty"><h3>Couldn't search</h3>${esc(search.error)}</div>`;
    return;
  }
  if (!search.results.length) {
    body.innerHTML = `<div class="empty"><h3>No results for "${esc(search.q)}"</h3>Check the spelling, or try fewer words.</div>`;
    return;
  }
  body.innerHTML = `<div class="tracklist">${search.results.map(searchRow).join("")}</div>`;
}

let searchTimer = null;
let searchAbort = null;

async function runSearch(q) {
  q = q.trim();
  search.q = q;
  if (!q) {
    search = { q: "", results: null, loading: false, error: "" };
    renderSearchHome();
    return;
  }
  searchAbort?.abort();
  const ctrl = (searchAbort = new AbortController());
  search.loading = true;
  search.error = "";
  renderSearchResults();
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed");
    if (ctrl.signal.aborted) return;
    search.results = data.results;
  } catch (err) {
    if (err.name === "AbortError") return;
    search.error = err.message;
    search.results = [];
  }
  search.loading = false;
  renderSearchResults();
}

function rememberSearch(q) {
  q = q.trim();
  if (!q) return;
  const recent = store.get("recent", []).filter((x) => x.toLowerCase() !== q.toLowerCase());
  store.set("recent", [q, ...recent].slice(0, 6));
}

const searchInput = $("#search-input");
searchInput.addEventListener("input", () => {
  $("#search-clear").hidden = !searchInput.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(searchInput.value), 300);
});
$("#search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  clearTimeout(searchTimer);
  runSearch(searchInput.value);
  rememberSearch(searchInput.value);
  searchInput.blur();
});
$("#search-clear").addEventListener("click", () => {
  searchInput.value = "";
  $("#search-clear").hidden = true;
  runSearch("");
  searchInput.focus();
});

function setSearch(q) {
  searchInput.value = q;
  $("#search-clear").hidden = !q;
  rememberSearch(q);
  runSearch(q);
}

// ---------- Navigation ----------

function go(view) {
  currentView = view;
  for (const v of $$(".view")) v.hidden = v.dataset.view !== view;
  for (const t of $$(".tab")) t.classList.toggle("active", t.dataset.goto === view);
  window.scrollTo({ top: 0 });
  if (view === "search" && !searchInput.value) setTimeout(() => searchInput.focus(), 50);
  history.replaceState(null, "", view === "home" ? "/" : `#${view}`);
}

// ---------- Preview player ----------

const audio = $("#audio");
const preview = { track: null };

function togglePreview(t) {
  if (preview.track?.trackId === t.trackId && audio.src) {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
    return;
  }
  if (!t.preview) {
    toast("No preview for this one");
    return;
  }
  preview.track = t;
  audio.src = t.preview;
  audio.play().catch(() => toast("Couldn't play the preview"));
  $("#mini").hidden = false;
  $("#mini-art").src = t.artwork;
  $("#mini-title").textContent = t.title;
  $("#mini-sub").textContent = `Preview · ${t.artist}`;
  coverColor(t.artwork).then((c) => $("#mini").style.setProperty("--mini", c || "#3e3e3e"));
  refreshMiniAdd();
}

function refreshMini() {
  $("#mini-play").innerHTML = audio.paused ? I.play : I.pause;
  $("#mini-play").setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  if (search.results && currentView === "search") renderSearchResults();
}

function refreshMiniAdd() {
  if (!preview.track) return;
  const added = inQueue(preview.track.trackId);
  const btn = $("#mini-add");
  btn.innerHTML = added ? I.check : I.plus;
  btn.classList.toggle("done", added);
}

audio.addEventListener("play", refreshMini);
audio.addEventListener("pause", refreshMini);
audio.addEventListener("ended", () => {
  $("#mini-bar").style.width = "0";
  refreshMini();
});
audio.addEventListener("timeupdate", () => {
  if (audio.duration) $("#mini-bar").style.width = `${(audio.currentTime / audio.duration) * 100}%`;
});
$("#mini-play").addEventListener("click", () => preview.track && togglePreview(preview.track));
$("#mini-add").addEventListener("click", () => preview.track && addTrack(preview.track));
$(".mini-text").addEventListener("click", () => preview.track && openSongSheet(preview.track));

// ---------- Actions ----------

async function addTrack(t) {
  if (inQueue(t.trackId) && !pendingAdds.has(t.trackId)) {
    const existing = state.nowPlaying?.trackId === t.trackId ? state.nowPlaying : state.queue.find((s) => s.trackId === t.trackId);
    toast(existing && existing.likers.includes(me.id) ? "Already in the queue" : "Already in the queue. Tap ♥ to vote for it");
    return;
  }
  if (pendingAdds.has(t.trackId)) return;
  pendingAdds.add(t.trackId);
  try {
    const res = await api("/api/add", { trackId: t.trackId });
    if (search.q) rememberSearch(search.q);
    toast(res.duplicate ? "Already in the queue, so we liked it for you" : "Added to queue");
    if (navigator.vibrate) navigator.vibrate(15);
    afterMutation();
  } catch (err) {
    toast(err.message, true);
  } finally {
    pendingAdds.delete(t.trackId);
  }
}

async function likeSong(s) {
  try {
    await api("/api/like", { id: s.id });
    afterMutation();
  } catch (err) { toast(err.message, true); }
}

async function removeSong(s) {
  try {
    await api("/api/remove", { id: s.id });
    toast("Removed from queue");
    afterMutation();
  } catch (err) { toast(err.message, true); }
}

async function hostAction(action, extra = {}, okMsg) {
  try {
    await api("/api/host/action", { action, ...extra });
    if (okMsg) toast(okMsg);
    afterMutation();
  } catch (err) {
    toast(err.message, true);
  }
}

function exportText() {
  const lines = [];
  if (state.nowPlaying) lines.push(`Now: ${state.nowPlaying.title} – ${state.nowPlaying.artist}`);
  state.queue.forEach((s, i) => lines.push(`${i + 1}. ${s.title} – ${s.artist} (${s.addedBy})`));
  return lines.join("\n");
}

async function copyList() {
  const text = exportText();
  if (!text) {
    toast("The queue is empty");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast("Song list copied");
  } catch {
    openSheet(`<h3>Song list</h3><p class="sub">Copy this and paste it wherever you like.</p><textarea class="field" style="height:240px;padding:12px" readonly>${esc(text)}</textarea>`);
    $("#sheet textarea").select();
  }
}

// ---------- Sheets ----------

let sheetDone = null;

function openSheet(html, onClose) {
  $("#sheet-body").innerHTML = html;
  $("#sheet").hidden = false;
  $("#sheet-backdrop").hidden = false;
  sheetDone = onClose || null;
}

function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-backdrop").hidden = true;
  const cb = sheetDone;
  sheetDone = null;
  cb?.();
}

$("#sheet-backdrop").addEventListener("click", closeSheet);
$(".sheet-handle").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => e.key === "Escape" && !$("#sheet").hidden && closeSheet());

function action(act, label, icon, cls = "", attrs = "") {
  return `<button class="action ${cls}" data-act="${act}" ${attrs}>${icon}<span>${label}</span></button>`;
}

function openSongSheet(item) {
  const key = reg(item);
  const isSong = Boolean(item.id);
  const live = isSong
    ? state.nowPlaying?.id === item.id ? state.nowPlaying : state.queue.find((s) => s.id === item.id) || state.history.find((s) => s.id === item.id)
    : null;
  const s = live || item;
  const status = !isSong ? "catalog" : state.nowPlaying?.id === s.id ? "playing" : state.queue.some((q) => q.id === s.id) ? "queued" : "played";
  const k = `data-key="${key}"`;
  const mine = me.id && s.owner === me.id;
  const liked = isSong && me.id && s.likers?.includes(me.id);
  const added = inQueue(s.trackId);
  const blocked = s.explicit && state.settings.blockExplicit && !isHost();

  let html = `
    <div class="sheet-song">
      <img src="${esc(s.artwork)}" alt="">
      <div>
        <div class="t ellipsis">${esc(s.title)}</div>
        <div class="a ellipsis">${explicitBadge(s)} ${esc(s.artist)}${s.album ? ` · ${esc(s.album)}` : ""}</div>
        ${isSong ? `<div class="a ellipsis">Added by ${mine ? "you" : esc(s.addedBy)} · ${timeAgo(s.addedAt)}${s.likes ? ` · ${s.likes} ♥` : ""}</div>` : ""}
      </div>
    </div>`;

  if (status === "catalog" && !added && !blocked) html += action("add", "Add to queue", I.plus, "green", k);
  if (status === "catalog" && blocked) html += `<div class="action" style="color:var(--sub)">${I.lock}<span>Explicit songs are turned off</span></div>`;
  if (s.preview) html += action("preview", preview.track?.trackId === s.trackId && !audio.paused ? "Pause preview" : "Play 30s preview", preview.track?.trackId === s.trackId && !audio.paused ? I.pause : I.play, "", k);
  if (status === "queued" || status === "playing") html += action("like", liked ? "Remove like" : "Like (vote it up)", liked ? I.heartFill : I.heart, liked ? "green" : "", k);
  html += `<a class="action" href="${esc(spotifyUrl(s))}" target="_blank" rel="noopener">${I.out}<span>Open in Spotify</span></a>`;
  if (s.url) html += `<a class="action" href="${esc(s.url)}" target="_blank" rel="noopener">${I.out}<span>Open in Apple Music</span></a>`;

  if (isHost() && isSong) {
    html += `<div class="group-title">Host</div>`;
    if (status === "queued") {
      html += action("host-play", "Play now", I.play, "", k);
      if (state.settings.sort !== "likes") {
        html += action("host-playnext", "Move to top", I.top, "", k);
        html += action("host-up", "Move up", I.up, "", k);
        html += action("host-down", "Move down", I.down, "", k);
      }
      html += action("host-played", "Mark as played", I.done, "", k);
    }
    if (status === "playing") html += action("host-next", "Done, play next song", I.next, "", k);
    if (status === "played") html += action("host-requeue", "Add back to queue", I.redo, "", k);
  }
  if (isSong && (isHost() || (mine && status === "queued"))) html += action("remove", "Remove from queue", I.trash, "danger", k);

  openSheet(html);
}

// ---------- Sign up / log in ----------

function showAuth(mode = "signup") {
  const el = $("#auth");
  el.hidden = false;
  const s = state.settings || {};
  const signup = mode === "signup";
  el.innerHTML = `
    <div class="auth-inner">
      <img src="/icon.svg" alt="" class="auth-logo">
      <h1>${signup ? "Sign up to add<br>your songs" : "Log in to<br>Class Queue"}</h1>
      ${signup && s.signupsOpen === false ? `<div class="banner">Sign-ups are closed right now. Ask the host.</div>` : ""}
      <form id="auth-form" novalidate>
        ${signup ? `
          <label class="auth-label" for="auth-name">Your name</label>
          <input class="field" id="auth-name" maxlength="24" autocomplete="given-name" placeholder="What your classmates see">` : ""}
        <label class="auth-label" for="auth-user">Username</label>
        <input class="field" id="auth-user" maxlength="20" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. leon_m">
        <label class="auth-label" for="auth-pass">Password</label>
        <input class="field" id="auth-pass" type="password" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "At least 6 characters" : ""}">
        ${signup && s.codeRequired ? `
          <label class="auth-label" for="auth-code">Class code</label>
          <input class="field" id="auth-code" autocapitalize="none" autocomplete="off" placeholder="Ask the host for it">` : ""}
        <p class="auth-error" id="auth-error" role="alert"></p>
        <button class="btn-green" type="submit">${signup ? "Sign up" : "Log in"}</button>
      </form>
      <div class="auth-switch">
        ${signup ? `Already have an account? <button data-auth="login">Log in</button>` : `Don't have an account? <button data-auth="signup">Sign up</button>`}
      </div>
      ${signup ? "" : `<p class="auth-fine">Forgot your password? Ask the host to reset it.</p>`}
    </div>`;
  setTimeout(() => $(signup ? "#auth-name" : "#auth-user")?.focus(), 60);
  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#auth-form button[type=submit]");
    const err = $("#auth-error");
    err.textContent = "";
    btn.disabled = true;
    const body = { username: $("#auth-user").value, password: $("#auth-pass").value };
    if (signup) {
      body.name = $("#auth-name").value;
      body.code = $("#auth-code")?.value || "";
    }
    try {
      const res = await api(signup ? "/api/signup" : "/api/login", body);
      setUser(res.user, res.token);
      el.hidden = true;
      el.innerHTML = "";
      render();
      toast(signup ? `Welcome, ${res.user.name}!` : `Welcome back, ${res.user.name}`);
    } catch (e2) {
      err.textContent = e2.message;
      btn.disabled = false;
    }
  });
}

$("#auth").addEventListener("click", (e) => {
  const b = e.target.closest("[data-auth]");
  if (b) showAuth(b.dataset.auth);
});

function openProfile() {
  const s = state.settings;
  let html = `
    <div class="sheet-song" style="border:0">
      <div class="avatar big" style="--avatar:${colorFor(me.name)}">${esc(me.name.slice(0, 1))}</div>
      <div><div class="t">${esc(me.name)}</div><div class="a">@${esc(me.username)}</div></div>
    </div>
    <p class="sub">${state.queue.filter((q) => q.owner === me.id).length} of your songs are waiting in the queue.</p>`;

  if (!isHost()) {
    html += `
      ${action("logout", "Log out", I.out)}
      <div class="group-title">Host</div>
      <p class="sub">Running the music? Enter the dashboard password to control the queue from your phone.</p>
      <form id="pin-form">
        <input class="field" id="pin-input" type="password" autocomplete="off" placeholder="Dashboard password">
        <button class="btn-outline" type="submit">${I.lock} Unlock host controls</button>
      </form>`;
  } else {
    html += `
      <a class="action green" href="/admin">${I.out}<span>Open the dashboard</span></a>
      <div class="group-title">Host settings</div>
      <label class="setting"><div><div class="l">Pause requests</div><div class="s">Nobody else can add songs</div></div>
        <span class="switch"><input type="checkbox" data-setting="locked" ${s.locked ? "checked" : ""}><span></span></span></label>
      <label class="setting"><div><div class="l">Block explicit songs</div><div class="s">Hides the + on songs marked E</div></div>
        <span class="switch"><input type="checkbox" data-setting="blockExplicit" ${s.blockExplicit ? "checked" : ""}><span></span></span></label>
      <div class="setting"><div><div class="l">Queue order</div></div>
        <div class="seg"><button data-act="sort" data-sort="added" class="${s.sort !== "likes" ? "on" : ""}">First come</button><button data-act="sort" data-sort="likes" class="${s.sort === "likes" ? "on" : ""}">Most liked</button></div></div>
      <div class="setting"><div><div class="l">Songs per person</div><div class="s">How many each person can have waiting</div></div>
        <div class="stepper"><button class="icon-btn" data-act="limit" data-d="-1" aria-label="Fewer">−</button><output>${s.maxPerPerson}</output><button class="icon-btn" data-act="limit" data-d="1" aria-label="More">+</button></div></div>
      <div class="group-title">Queue</div>
      ${action("copy", "Copy song list", I.copy)}
      ${action("clear-history", "Clear recently played", I.trash)}
      ${action("clear-queue", "Clear the whole queue", I.trash, "danger")}
      ${action("host-logout", "Leave host mode", I.user)}
      ${action("logout", "Log out", I.out)}`;
  }
  openSheet(html);

  $("#pin-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = $("#pin-input").value;
    if (!pw) return;
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Password": pw },
        body: "{}",
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Wrong password");
      me.adminPw = pw;
      store.set("adminPw", pw);
      render();
      toast("You're the host now");
      openProfile();
    } catch (err) {
      toast(err.message, true);
    }
  });

  for (const box of $$("[data-setting]")) {
    box.addEventListener("change", () => hostAction("settings", { settings: { [box.dataset.setting]: box.checked } }));
  }
}

// ---------- Event delegation ----------

document.addEventListener("click", (e) => {
  const goto = e.target.closest("[data-goto]");
  if (goto) {
    if (!$("#sheet").hidden) closeSheet();
    go(goto.dataset.goto);
    return;
  }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const item = el.dataset.key ? registry.get(el.dataset.key) : null;
  const inSheet = Boolean(el.closest("#sheet"));
  const act = el.dataset.act;

  switch (act) {
    case "preview": togglePreview(item); if (inSheet) closeSheet(); break;
    case "add": addTrack(item); if (inSheet) closeSheet(); break;
    case "like": likeSong(item); if (inSheet) closeSheet(); break;
    case "more": openSongSheet(item); break;
    case "remove": removeSong(item); closeSheet(); break;
    case "recent": setSearch(el.dataset.q); break;
    case "clear-recent": store.set("recent", []); renderSearchHome(); break;
    case "host-next": hostAction("next"); if (inSheet) closeSheet(); break;
    case "host-play": hostAction("play", { id: item.id }, "Now playing"); closeSheet(); break;
    case "host-playnext": hostAction("playNext", { id: item.id }, "Moved to the top"); closeSheet(); break;
    case "host-up": hostAction("move", { id: item.id, dir: "up" }); closeSheet(); break;
    case "host-down": hostAction("move", { id: item.id, dir: "down" }); closeSheet(); break;
    case "host-played": hostAction("markPlayed", { id: item.id }); closeSheet(); break;
    case "host-requeue": hostAction("requeue", { id: item.id }, "Added back to queue"); closeSheet(); break;
    case "sort":
      hostAction("settings", { settings: { sort: el.dataset.sort } });
      for (const b of $$(".seg button")) b.classList.toggle("on", b === el);
      break;
    case "limit": {
      const out = el.parentElement.querySelector("output");
      const n = Math.max(1, Math.min(50, Number(out.textContent) + Number(el.dataset.d)));
      out.textContent = n;
      hostAction("settings", { settings: { maxPerPerson: n } });
      break;
    }
    case "copy": copyList(); break;
    case "clear-history":
      if (confirm("Clear the recently played list?")) { hostAction("clearHistory", {}, "History cleared"); closeSheet(); }
      break;
    case "clear-queue":
      if (confirm("Remove every song from the queue?")) { hostAction("clearQueue", {}, "Queue cleared"); closeSheet(); }
      break;
    case "logout":
      closeSheet();
      api("/api/logout", {}).catch(() => {});
      me.adminPw = "";
      store.set("adminPw", "");
      signOut();
      break;
    case "host-logout":
      me.adminPw = "";
      store.set("adminPw", "");
      closeSheet();
      render();
      toast("Left host mode");
      break;
  }
});

for (const pill of $$("[data-filter]")) {
  pill.addEventListener("click", () => {
    queueFilter = pill.dataset.filter;
    for (const p of $$("[data-filter]")) p.classList.toggle("active", p === pill);
    renderQueue();
  });
}

$("#avatar-btn").addEventListener("click", openProfile);
$("#next-btn").addEventListener("click", () => hostAction("next"));
$("#export-btn").addEventListener("click", copyList);

// ---------- Toast ----------

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.toggle("error", isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

// ---------- Boot ----------

async function loadTrending() {
  try {
    const data = await api("/api/top");
    trending = data.results.slice(0, 20);
  } catch {
    trending = [];
  }
  renderHome();
}

(async function boot() {
  renderSearchHome();
  const start = location.hash.slice(1);
  go(["search", "queue"].includes(start) ? start : "home");
  await refreshState();
  let signedIn = false;
  if (me.token) {
    try {
      setUser((await api("/api/me")).user);
      signedIn = true;
    } catch {}
  }
  if (!signedIn) showAuth(store.get("hadAccount", false) ? "login" : "signup");
  render();
  connect();
  loadTrending();
})();
