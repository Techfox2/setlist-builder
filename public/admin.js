// Host dashboard: stats, queue control, members, settings and an activity log.

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

const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 5.5v13l9-6.5zM16 5h2.5v14H16z"/></svg>',
  top: '<svg viewBox="0 0 24 24"><path d="M5 4h14v2H5zm7 4 7 7-1.4 1.4-4.6-4.6V21h-2v-9.2l-4.6 4.6L5 15z"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m12 7 7 7-1.4 1.4-5.6-5.6-5.6 5.6L5 14z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m12 17-7-7 1.4-1.4 5.6 5.6 5.6-5.6L19 10z"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7zm2.2 2 .7 8h6.2l.7-8z"/></svg>',
  out: '<svg viewBox="0 0 24 24"><path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 0 1 7.4 5H22l-3.5 4L15 9h2.2A6 6 0 1 0 18 14h2.1A8 8 0 1 1 12 4z"/></svg>',
  block: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 0 0-6.3 12.9L16.9 5.7A8 8 0 0 0 12 4zm6.3 3.1L7.1 18.3A8 8 0 0 0 18.3 7.1z"/></svg>',
  key: '<svg viewBox="0 0 24 24"><path d="M7.5 6.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12.5 10.5H22v3h-2v3h-3v-3h-4.5z"/></svg>',
};

let pw = store.get("adminPw", "");
let data = null;
let memberQuery = "";

// ---------- Network ----------

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "X-Admin-Password": pw },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await res.json().catch(() => ({}));
  if (res.status === 403) lock(d.error);
  if (!res.ok) throw new Error(d.error || "Something went wrong");
  return d;
}

async function load() {
  try {
    data = await api("/api/admin/overview");
    $("#gate").hidden = true;
    $("#dash").hidden = false;
    render();
  } catch (err) {
    if ($("#dash").hidden) showGate(err.message);
  }
}

let reloadTimer = null;
function scheduleLoad() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 250);
}

async function act(action, extra = {}, okMsg) {
  try {
    const r = await api("/api/admin/action", { action, ...extra });
    if (okMsg) toast(okMsg);
    scheduleLoad();
    return r;
  } catch (err) {
    toast(err.message, true);
  }
}

let ws = null;
function connect() {
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
  ws.onopen = () => setLive(true);
  ws.onmessage = (e) => e.data !== "pong" && scheduleLoad();
  ws.onclose = () => {
    setLive(false);
    setTimeout(connect, 3000);
  };
}
setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25000);
setInterval(() => !$("#dash").hidden && load(), 30000); // keeps "active" times fresh

function setLive(on) {
  $("#live-dot").classList.toggle("on", on);
  $("#live-text").textContent = on ? "Live" : "Reconnecting…";
}

// ---------- Gate ----------

function showGate(msg = "") {
  $("#dash").hidden = true;
  $("#gate").hidden = false;
  $("#gate-error").textContent = msg && pw ? msg : "";
  setTimeout(() => $("#gate-pw").focus(), 50);
}

function lock(msg) {
  pw = "";
  store.set("adminPw", "");
  showGate(msg);
}

$("#gate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  pw = $("#gate-pw").value;
  if (!pw) return;
  try {
    data = await api("/api/admin/overview");
    store.set("adminPw", pw);
    $("#gate-pw").value = "";
    $("#gate").hidden = true;
    $("#dash").hidden = false;
    render();
    connect();
  } catch (err) {
    $("#gate-error").textContent = err.message;
  }
});

$("#lock-btn").addEventListener("click", () => lock());

// ---------- Formatting ----------

const AVATAR_COLORS = ["#e8115b", "#1e3264", "#8400e7", "#e1118c", "#148a08", "#dc148c", "#0d73ec", "#ba5d07", "#e91429", "#509bf5", "#af2896", "#27856a"];
function colorFor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} d ago` : new Date(ts).toLocaleDateString();
}

function clock(ts) {
  const d = new Date(ts);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const explicit = (t) => (t.explicit ? '<span class="e-badge" title="Explicit">E</span>' : "");
const btn = (act, icon, label, attrs = "", cls = "") => `<button class="row-btn ${cls}" data-act="${act}" ${attrs} title="${label}" aria-label="${label}">${icon}</button>`;

// ---------- Rendering ----------

function render() {
  if (!data) return;
  renderOverview();
  renderQueue();
  renderMembers();
  renderSettings();
  renderFeed();
}

function renderOverview() {
  const s = data.stats;
  const tiles = [
    [data.online, "Online now"],
    [s.members, "Members"],
    [s.activeToday, "Active today"],
    [s.queued, "In the queue"],
    [s.addedToday, "Added today"],
    [s.played, "Played"],
    [s.likes, "Likes"],
  ];
  $("#tiles").innerHTML = tiles.map(([n, l]) => `<div class="tile-stat"><div class="n">${n}</div><div class="l">${l}</div></div>`).join("");

  const np = data.nowPlaying;
  $("#dash-now").innerHTML = np
    ? `<div class="now-card">
        <img src="${esc(np.artwork)}" alt="">
        <div class="info">
          <div class="label"><span class="eq"><i></i><i></i><i></i></span>Now playing</div>
          <div class="t ellipsis">${esc(np.title)}</div>
          <div class="a ellipsis">${esc(np.artist)} · added by ${esc(np.addedBy)}</div>
        </div>
        <button class="btn-green sm" data-act="next">${I.next} Next</button>
      </div>`
    : `<div class="now-card empty">
        <div><div class="t">Nothing playing</div><div class="a">${data.queue.length ? `${data.queue.length} song${data.queue.length === 1 ? "" : "s"} waiting` : "The queue is empty"}</div></div>
        ${data.queue.length ? `<button class="btn-green sm" data-act="next" style="margin-left:auto">${I.play} Start the queue</button>` : ""}
      </div>`;
}

function songCell(s) {
  return `<div class="song"><img src="${esc(s.artwork)}" alt="" loading="lazy"><div><div class="t ellipsis">${esc(s.title)}</div><div class="a">${explicit(s)}<span class="ellipsis">${esc(s.artist)}</span></div></div></div>`;
}

function spotifyUrl(t) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${t.title} ${t.artist}`)}`;
}

function renderQueue() {
  const q = data.queue;
  const manual = data.settings.sort !== "likes";
  $("#queue-tbl").innerHTML = `
    <thead><tr><th class="num-col">#</th><th>Title</th><th class="hide-sm">Added by</th><th class="hide-sm">Added</th><th>♥</th><th></th></tr></thead>
    <tbody>${q.length ? q.map((s, i) => `
      <tr>
        <td class="num-col">${i + 1}</td>
        <td>${songCell(s)}</td>
        <td class="muted hide-sm">${esc(s.addedBy)}</td>
        <td class="muted hide-sm">${ago(s.addedAt)}</td>
        <td class="muted">${s.likes}</td>
        <td><span class="acts">
          <a class="row-btn" href="${esc(spotifyUrl(s))}" target="_blank" rel="noopener" title="Open in Spotify" aria-label="Open in Spotify">${I.out}</a>
          ${btn("play", I.play, "Play now", `data-id="${s.id}"`)}
          ${manual ? btn("playNext", I.top, "Move to top", `data-id="${s.id}"`) + btn("up", I.up, "Move up", `data-id="${s.id}"`) + btn("down", I.down, "Move down", `data-id="${s.id}"`) : ""}
          ${btn("remove", I.trash, "Remove", `data-id="${s.id}"`, "danger")}
        </span></td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty-cell">The queue is empty.</td></tr>`}
    </tbody>`;

  $("#played-wrap").hidden = !data.history.length;
  $("#played-tbl").innerHTML = `<tbody>${data.history.map((s) => `
    <tr>
      <td>${songCell(s)}</td>
      <td class="muted hide-sm">${esc(s.addedBy)}</td>
      <td><span class="acts">${btn("requeue", I.redo, "Add back to queue", `data-id="${s.id}"`)}</span></td>
    </tr>`).join("")}</tbody>`;
}

function renderMembers() {
  const q = memberQuery.toLowerCase();
  const list = data.users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.username.includes(q));
  $("#member-count").textContent = data.users.length;
  $("#members-tbl").innerHTML = `
    <thead><tr><th>Name</th><th class="hide-sm">Joined</th><th class="hide-sm">Last active</th><th>Songs</th><th class="hide-sm">Likes given</th><th></th></tr></thead>
    <tbody>${list.length ? list.map((u) => `
      <tr>
        <td><div class="who"><span class="avatar" style="--avatar:${colorFor(u.name)}">${esc(u.name.slice(0, 1))}</span>
          <div><div style="font-weight:600">${esc(u.name)} ${u.banned ? '<span class="tag bad">Blocked</span>' : ""}</div><div class="muted" style="font-size:13px">@${esc(u.username)}</div></div></div></td>
        <td class="muted hide-sm">${ago(u.created_at)}</td>
        <td class="muted hide-sm">${ago(u.last_seen)}</td>
        <td class="muted">${u.songs}${u.waiting ? ` <span class="tag good">${u.waiting} waiting</span>` : ""}</td>
        <td class="muted hide-sm">${u.likes_given}</td>
        <td><span class="acts">
          ${btn("resetPassword", I.key, "Reset password", `data-user="${u.id}"`)}
          ${u.banned ? btn("unban", I.redo, "Unblock", `data-user="${u.id}"`) : btn("ban", I.block, "Block", `data-user="${u.id}"`, "danger")}
          ${btn("deleteUser", I.trash, "Delete account", `data-user="${u.id}"`, "danger")}
        </span></td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty-cell">${data.users.length ? "No one matches." : "No one has signed up yet. Share the link!"}</td></tr>`}
    </tbody>`;
}

function renderSettings() {
  const s = data.settings;
  const sw = (key, label, sub) => `
    <label class="setting"><div><div class="l">${label}</div><div class="s">${sub}</div></div>
      <span class="switch"><input type="checkbox" data-setting="${key}" ${s[key] ? "checked" : ""}><span></span></span></label>`;
  // Don't wipe a code the host is in the middle of typing.
  const focused = document.activeElement?.id === "code-input";
  if (focused) return;
  $("#settings-box").innerHTML = `
    ${sw("signupsOpen", "Allow sign-ups", "New people can create an account")}
    <div class="setting"><div><div class="l">Class code</div><div class="s">${s.signupCode ? "Needed to sign up" : "Off: anyone with the link can sign up"}</div></div>
      <form class="code-row" id="code-form"><input class="field" id="code-input" maxlength="40" placeholder="e.g. 10b" value="${esc(s.signupCode)}" autocomplete="off"><button class="btn-white sm" type="submit">Save</button></form></div>
    ${sw("locked", "Pause requests", "Members can't add songs")}
    ${sw("blockExplicit", "Block explicit songs", "Songs marked E can't be added")}
    <div class="setting"><div><div class="l">Queue order</div><div class="s">How the next song is picked</div></div>
      <div class="seg"><button data-act="sort" data-sort="added" class="${s.sort !== "likes" ? "on" : ""}">First come</button><button data-act="sort" data-sort="likes" class="${s.sort === "likes" ? "on" : ""}">Most liked</button></div></div>
    <div class="setting"><div><div class="l">Songs per person</div><div class="s">Waiting in the queue at once</div></div>
      <div class="stepper"><button class="icon-btn" data-act="limit" data-d="-1" aria-label="Fewer">−</button><output>${s.maxPerPerson}</output><button class="icon-btn" data-act="limit" data-d="1" aria-label="More">+</button></div></div>`;
}

function renderFeed() {
  $("#feed").innerHTML = data.events.length
    ? data.events.map((e) => `<li><time datetime="${new Date(e.at).toISOString()}">${clock(e.at)}</time><span><b>${esc(e.who)}</b> ${esc(e.text)}</span></li>`).join("")
    : `<li class="muted">Nothing yet.</li>`;
}

// ---------- Events ----------

function userName(id) {
  return data.users.find((u) => u.id === id)?.name || "this member";
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const id = el.dataset.id;
  const userId = el.dataset.user;
  switch (el.dataset.act) {
    case "next": act("next"); break;
    case "play": act("play", { id }, "Now playing"); break;
    case "playNext": act("playNext", { id }, "Moved to the top"); break;
    case "up": act("move", { id, dir: "up" }); break;
    case "down": act("move", { id, dir: "down" }); break;
    case "remove": act("remove", { id }, "Removed"); break;
    case "requeue": act("requeue", { id }, "Added back to queue"); break;
    case "clear-queue": if (confirm("Remove every song from the queue?")) act("clearQueue", {}, "Queue cleared"); break;
    case "clear-history": if (confirm("Clear the recently played list?")) act("clearHistory", {}, "History cleared"); break;
    case "clear-log": if (confirm("Clear the activity log?")) act("clearLog"); break;
    case "copy": copyList(); break;
    case "sort": act("settings", { settings: { sort: el.dataset.sort } }); break;
    case "limit": {
      const n = Math.max(1, Math.min(50, data.settings.maxPerPerson + Number(el.dataset.d)));
      data.settings.maxPerPerson = n;
      el.parentElement.querySelector("output").textContent = n;
      act("settings", { settings: { maxPerPerson: n } });
      break;
    }
    case "ban":
      confirmSheet(`Block ${esc(userName(userId))}?`, "They get logged out and can't log back in or add songs until you unblock them.",
        "Block", () => act("ban", { userId, removeSongs: $("#ban-songs")?.checked }, "Blocked"),
        `<label class="setting"><div class="l">Also remove their waiting songs</div><span class="switch"><input type="checkbox" id="ban-songs" checked><span></span></span></label>`);
      break;
    case "unban": act("unban", { userId }, "Unblocked"); break;
    case "deleteUser":
      confirmSheet(`Delete ${esc(userName(userId))}'s account?`, "Their waiting songs and likes are removed. They can sign up again unless sign-ups are closed.",
        "Delete account", () => act("deleteUser", { userId }, "Account deleted"));
      break;
    case "resetPassword":
      confirmSheet(`Reset ${esc(userName(userId))}'s password?`, "You'll get a new temporary password to tell them. They'll be logged out everywhere.",
        "Reset password", async () => {
          const r = await act("resetPassword", { userId });
          if (r?.password) openSheet(`<h3>New password</h3><p class="sub">Tell ${esc(userName(userId))} to log in with:</p>
            <div class="field" style="display:flex;align-items:center;font-size:20px;font-weight:700;letter-spacing:.02em">${esc(r.password)}</div>
            <button class="btn-white" data-close>Done</button>`);
        });
      break;
  }
});

document.addEventListener("change", (e) => {
  const box = e.target.closest("[data-setting]");
  if (box) act("settings", { settings: { [box.dataset.setting]: box.checked } });
});

document.addEventListener("submit", (e) => {
  if (e.target.id !== "code-form") return;
  e.preventDefault();
  const code = $("#code-input").value.trim();
  $("#code-input").blur();
  act("settings", { settings: { signupCode: code } }, code ? `Class code set to "${code}"` : "Class code turned off");
});

$("#member-search").addEventListener("input", (e) => {
  memberQuery = e.target.value.trim();
  renderMembers();
});

// Highlight the section you're looking at in the sidebar.
const observer = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (en.isIntersecting) for (const a of $$(".side-nav a")) a.classList.toggle("active", a.getAttribute("href") === `#${en.target.id}`);
  }
}, { rootMargin: "-20% 0px -70% 0px" });
for (const s of $$(".dash-main section")) observer.observe(s);

async function copyList() {
  const lines = [];
  if (data.nowPlaying) lines.push(`Now: ${data.nowPlaying.title} – ${data.nowPlaying.artist}`);
  data.queue.forEach((s, i) => lines.push(`${i + 1}. ${s.title} – ${s.artist} (${s.addedBy})`));
  if (!lines.length) return toast("The queue is empty");
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    toast("Song list copied");
  } catch {
    toast("Couldn't copy", true);
  }
}

// ---------- Dialogs & toast ----------

function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  $("#sheet").hidden = false;
  $("#sheet-backdrop").hidden = false;
}

function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-backdrop").hidden = true;
}

function confirmSheet(title, sub, label, onYes, extra = "") {
  openSheet(`<h3>${title}</h3><p class="sub">${sub}</p>${extra}
    <button class="btn-green" id="yes-btn" style="background:var(--red);color:#fff">${label}</button>
    <button class="btn-outline" data-close>Cancel</button>`);
  $("#yes-btn").addEventListener("click", () => {
    onYes();
    closeSheet();
  });
}

$("#sheet-backdrop").addEventListener("click", closeSheet);
document.addEventListener("click", (e) => e.target.closest("[data-close]") && closeSheet());
document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheet());

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

if (pw) {
  load().then(() => !$("#dash").hidden && connect());
} else {
  showGate();
}
