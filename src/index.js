import { DurableObject } from "cloudflare:workers";

// ---------------------------------------------------------------------------
// HTTP entry point. Static files in public/ are served by Cloudflare directly;
// this only runs for /api/* requests.
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      return await route(request, env, ctx, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      console.error(err);
      return json({ error: "Something went wrong. Try again." }, 500);
    }
  },
};

async function route(request, env, ctx, url) {
  const room = env.ROOM.get(env.ROOM.idFromName("main"));
  const path = url.pathname;
  const method = request.method;
  const ip = request.headers.get("CF-Connecting-IP") || "local";

  if (path === "/api/ws") {
    if (request.headers.get("Upgrade") !== "websocket") throw new HttpError(426, "Expected a WebSocket");
    return room.fetch(request);
  }
  if (path === "/api/state" && method === "GET") return json(await room.getState());
  if (path === "/api/search" && method === "GET") return json(await search(url.searchParams.get("q"), request, env, ctx));
  if (path === "/api/top" && method === "GET") return json(await topCharts(request, env, ctx));

  const admin = await checkAdmin(request, env, room, ip);

  if (path === "/api/me" && method === "GET") {
    const user = await currentUser(request, room);
    if (!user) throw new HttpError(401, "Please log in");
    return json({ user });
  }
  if (path === "/api/admin/overview" && method === "GET") {
    requireAdmin(admin, env);
    return json(await room.adminOverview());
  }

  if (method !== "POST") throw new HttpError(404, "Not found");
  const body = await readBody(request);

  switch (path) {
    case "/api/signup": {
      const username = cleanUsername(body.username);
      const name = cleanName(body.name);
      const password = checkPassword(body.password);
      if (await room.tooManyFails(`signup:${ip}`, 60)) throw new HttpError(429, "Too many sign-ups from this network. Try later.");
      const passHash = await hashPassword(password);
      const token = randomHex(32);
      const r = await room.signup({ username, name, passHash, code: String(body.code || ""), tokenHash: await sha256Hex(token) });
      if (r.error) throw new HttpError(400, r.error);
      await room.recordFail(`signup:${ip}`); // counts sign-ups, not failures
      return json({ token, user: r.user });
    }
    case "/api/login": {
      const username = String(body.username || "").trim().toLowerCase().replace(/^@/, "");
      const key = `login:${username}`;
      if (await room.tooManyFails(key, 10)) throw new HttpError(429, "Too many wrong tries. Wait 10 minutes.");
      const acct = await room.accountForLogin(username);
      if (!acct || !(await verifyPassword(String(body.password || ""), acct.pass_hash))) {
        await room.recordFail(key);
        throw new HttpError(400, "Wrong username or password");
      }
      if (acct.banned) throw new HttpError(403, "This account was blocked by the host");
      await room.clearFails(key);
      const token = randomHex(32);
      const user = await room.createSession(acct.id, await sha256Hex(token));
      return json({ token, user });
    }
    case "/api/logout": {
      const token = bearer(request);
      if (token) await room.deleteSession(await sha256Hex(token));
      return json({ ok: true });
    }
    case "/api/admin/login":
      requireAdmin(admin, env);
      return json({ ok: true });
    case "/api/admin/action":
    case "/api/host/action":
      requireAdmin(admin, env);
      if (body.action === "resetPassword") {
        const temp = randomWords();
        const r = await room.setPassword(String(body.userId || ""), await hashPassword(temp));
        return r.error ? result(r) : json({ ok: true, password: temp });
      }
      return result(await room.hostAction(body));
  }

  // Everything below needs a signed-in member.
  const user = await currentUser(request, room);
  if (!user) throw new HttpError(401, "Please log in");
  if (user.banned) throw new HttpError(403, "Your account was blocked by the host");

  switch (path) {
    case "/api/add": {
      const track = await lookupTrack(body.trackId, request, env, ctx);
      return result(await room.add({ track, user, host: admin }));
    }
    case "/api/like":
      return result(await room.like(String(body.id || ""), user.id));
    case "/api/remove":
      return result(await room.remove(String(body.id || ""), user, admin));
  }
  throw new HttpError(404, "Not found");
}

// ---------------------------------------------------------------------------
// Music catalog: Apple's free iTunes Search API (no key needed). It has
// basically every song on Spotify, with cover art and 30-second previews.
// ---------------------------------------------------------------------------

async function search(q, request, env, ctx) {
  q = String(q || "").trim().slice(0, 100);
  if (!q) return { results: [] };
  const country = countryOf(request);
  const api = `${env.ITUNES_BASE}/search?media=music&entity=song&limit=30&country=${country}&term=${encodeURIComponent(q)}`;
  const data = await cachedJson(api, 3600, ctx);
  return { results: (data.results || []).filter((r) => r.kind === "song").map(normalize) };
}

async function topCharts(request, env, ctx) {
  const country = countryOf(request);
  const feed = await cachedJson(`${env.CHARTS_BASE}/api/v2/${country}/music/most-played/50/songs.json`, 21600, ctx).catch(() => null);
  const ids = (feed?.feed?.results || []).map((r) => r.id).filter(Boolean);
  if (!ids.length) return { results: [] };
  // The chart feed has no previews, so look the tracks up in one batch call.
  const data = await cachedJson(`${env.ITUNES_BASE}/lookup?country=${country}&id=${ids.join(",")}`, 21600, ctx);
  const byId = new Map((data.results || []).filter((r) => r.kind === "song").map((r) => [String(r.trackId), normalize(r)]));
  return { results: ids.map((id) => byId.get(String(id))).filter(Boolean) };
}

async function lookupTrack(trackId, request, env, ctx) {
  trackId = String(trackId || "");
  if (!/^\d{1,15}$/.test(trackId)) throw new HttpError(400, "Pick a song from the search results");
  // Always fetch the song ourselves so nobody can inject fake titles.
  const data = await cachedJson(`${env.ITUNES_BASE}/lookup?country=${countryOf(request)}&id=${trackId}`, 86400, ctx);
  const hit = (data.results || []).find((r) => r.kind === "song");
  if (!hit) throw new HttpError(404, "Couldn't find that song anymore");
  return normalize(hit);
}

function normalize(r) {
  return {
    trackId: String(r.trackId),
    title: r.trackName || "Unknown",
    artist: r.artistName || "Unknown",
    album: r.collectionName || "",
    artwork: (r.artworkUrl100 || "").replace("100x100bb", "300x300bb"),
    preview: r.previewUrl || "",
    durationMs: r.trackTimeMillis || 0,
    explicit: r.trackExplicitness === "explicit",
    url: r.trackViewUrl || "",
  };
}

async function cachedJson(apiUrl, ttl, ctx) {
  const cache = caches.default;
  const key = new Request(apiUrl);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const res = await fetch(apiUrl, { headers: { "User-Agent": "setlist-builder" } });
  if (!res.ok) throw new HttpError(502, "The music catalog is busy. Try again in a moment.");
  const text = await res.text();
  ctx.waitUntil(cache.put(key, new Response(text, { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttl}` } })));
  return JSON.parse(text);
}

function countryOf(request) {
  const c = String(request.cf?.country || "US").toLowerCase();
  return /^[a-z]{2}$/.test(c) && c !== "xx" && c !== "t1" ? c : "us";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function result(r) {
  return r.error ? json(r, 400) : json(r);
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new HttpError(400, "Bad request");
  }
}

function cleanName(name) {
  name = String(name || "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!name) throw new HttpError(400, "Tell us your name first");
  return name;
}

function cleanUsername(u) {
  u = String(u || "").trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_.]{3,20}$/.test(u)) throw new HttpError(400, "Username: 3–20 letters, numbers, _ or .");
  return u;
}

function checkPassword(p) {
  p = String(p || "");
  if (p.length < 6) throw new HttpError(400, "Password needs at least 6 characters");
  if (p.length > 100) throw new HttpError(400, "That password is too long");
  return p;
}

function randomHex(bytes) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const WORDS = ["apple", "beat", "cloud", "disco", "echo", "funk", "groove", "happy", "indie", "jazz", "kiwi", "lemon", "mango", "neon", "ocean", "piano", "radio", "salsa", "tempo", "vinyl"];
function randomWords() {
  const a = crypto.getRandomValues(new Uint8Array(3));
  return `${WORDS[a[0] % 20]}-${WORDS[a[1] % 20]}-${10 + (a[2] % 90)}`;
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// PBKDF2 with a modest iteration count so a login fits in the free plan's CPU budget.
// The count is stored with the hash, so it can be raised later without breaking old accounts.
const PBKDF2_ITERATIONS = 10000;

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password) {
  const salt = randomHex(16);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${await pbkdf2(password, salt, PBKDF2_ITERATIONS)}`;
}

async function verifyPassword(password, stored) {
  const [, iter, salt, hash] = String(stored).split("$");
  if (!hash) return false;
  return safeEqual(await pbkdf2(password, salt, Number(iter)), hash);
}

function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  return x.length === y.length && crypto.subtle.timingSafeEqual(x, y);
}

function bearer(request) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer ([a-f0-9]{64})$/);
  return m ? m[1] : null;
}

async function currentUser(request, room) {
  const token = bearer(request);
  return token ? room.userForSession(await sha256Hex(token)) : null;
}

// The dashboard password. Wrong guesses are limited per network so it can't be brute-forced.
async function checkAdmin(request, env, room, ip) {
  const pw = request.headers.get("X-Admin-Password");
  if (!pw || !env.ADMIN_PASSWORD) return false;
  const key = `admin:${ip}`;
  if (await room.tooManyFails(key, 10)) throw new HttpError(429, "Too many wrong passwords. Wait 10 minutes.");
  const [a, b] = await Promise.all([sha256Hex(pw), sha256Hex(env.ADMIN_PASSWORD)]);
  if (safeEqual(a, b)) return true;
  await room.recordFail(key);
  return false;
}

function requireAdmin(admin, env) {
  if (!env.ADMIN_PASSWORD) throw new HttpError(400, "No admin password set yet. Run: npx wrangler secret put ADMIN_PASSWORD");
  if (!admin) throw new HttpError(403, "Wrong password");
}

// ---------------------------------------------------------------------------
// Room: the single shared queue, stored in a SQLite-backed Durable Object.
// Phones hold a WebSocket open and get the new queue pushed on every change.
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = { locked: false, blockExplicit: true, sort: "added", maxPerPerson: null, signupsOpen: true, signupCode: "" };
const FAIL_WINDOW_MS = 10 * 60 * 1000;

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.lastAdd = new Map();
    this.fails = new Map();
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        track TEXT NOT NULL,
        track_id TEXT NOT NULL,
        added_by TEXT NOT NULL,
        owner TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        position REAL NOT NULL,
        played_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS likes (
        song_id TEXT NOT NULL,
        liker TEXT NOT NULL,
        PRIMARY KEY (song_id, liker)
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        banned INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at INTEGER NOT NULL,
        who TEXT NOT NULL,
        text TEXT NOT NULL
      );
    `);
    // Lets phones keep the connection alive without waking (and billing) the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // --- WebSocket plumbing ---

  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "state", state: this.getState() }));
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage() {}

  webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code); } catch {}
    this.broadcast();
  }

  webSocketError() {
    this.broadcast();
  }

  broadcast() {
    const msg = JSON.stringify({ type: "state", state: this.getState() });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch {}
    }
  }

  // --- State ---

  getMeta(key, fallback) {
    const row = this.sql.exec("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
    return row ? JSON.parse(row.value) : fallback;
  }

  setMeta(key, value) {
    this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
  }

  settings() {
    const s = { ...DEFAULT_SETTINGS, ...this.getMeta("settings", {}) };
    s.maxPerPerson ??= Number(this.env.MAX_PER_PERSON) || 5;
    return s;
  }

  bump() {
    this.setMeta("version", this.getMeta("version", 0) + 1);
  }

  rows(status) {
    const order = status === "played" ? "played_at DESC LIMIT 30" : "position ASC";
    return this.sql
      .exec(
        `SELECT s.*, (SELECT COUNT(*) FROM likes l WHERE l.song_id = s.id) AS like_count,
                (SELECT group_concat(liker) FROM likes l WHERE l.song_id = s.id) AS likers
         FROM songs s WHERE status = ? ORDER BY ${order}`,
        status,
      )
      .toArray()
      .map((r) => ({
        id: r.id,
        ...JSON.parse(r.track),
        addedBy: r.added_by,
        owner: r.owner,
        addedAt: r.added_at,
        likes: r.like_count,
        likers: r.likers ? r.likers.split(",") : [],
      }));
  }

  orderedQueue(settings = this.settings()) {
    const queue = this.rows("queued");
    if (settings.sort === "likes") {
      // Stable: equal likes keep the order they were added in.
      queue.sort((a, b) => b.likes - a.likes);
    }
    return queue;
  }

  getState() {
    const { signupCode, ...settings } = this.settings();
    settings.codeRequired = Boolean(signupCode);
    return {
      version: this.getMeta("version", 0),
      settings,
      nowPlaying: this.rows("playing")[0] || null,
      queue: this.orderedQueue(settings),
      history: this.rows("played"),
      online: this.ctx.getWebSockets().length,
    };
  }

  changed(extra = {}) {
    this.bump();
    this.broadcast();
    return { ok: true, ...extra };
  }

  // --- Guest actions ---

  add({ track, user, host }) {
    const who = user.id;
    const name = user.name;
    const s = this.settings();
    if (!host) {
      if (s.locked) return { error: "The host has paused requests for now" };
      if (s.blockExplicit && track.explicit) return { error: "Explicit songs are turned off. Try the clean version!" };
      const now = Date.now();
      if (now - (this.lastAdd.get(who) || 0) < 3000) return { error: "Slow down a little 🙂" };
      const limit = s.maxPerPerson;
      const mine = this.sql.exec("SELECT COUNT(*) AS n FROM songs WHERE owner = ? AND status = 'queued'", who).one().n;
      if (mine >= limit) return { error: `You already have ${limit} songs waiting. Wait for one to play!` };
      this.lastAdd.set(who, now);
    }

    const dupe = this.sql
      .exec("SELECT id FROM songs WHERE track_id = ? AND status IN ('queued', 'playing')", track.trackId)
      .toArray()[0];
    if (dupe) {
      this.sql.exec("INSERT OR IGNORE INTO likes (song_id, liker) VALUES (?, ?)", dupe.id, who);
      return this.changed({ duplicate: true, id: dupe.id });
    }

    const id = crypto.randomUUID();
    const pos = this.sql.exec("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM songs").one().p;
    this.sql.exec(
      "INSERT INTO songs (id, track, track_id, added_by, owner, added_at, status, position) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?)",
      id, JSON.stringify(track), track.trackId, name, who, Date.now(), pos,
    );
    this.log(name, `added ${track.title} by ${track.artist}`);
    return this.changed({ id });
  }

  like(id, who) {
    if (!this.exists(id)) return { error: "That song is gone" };
    const had = this.sql.exec("SELECT 1 FROM likes WHERE song_id = ? AND liker = ?", id, who).toArray().length;
    if (had) this.sql.exec("DELETE FROM likes WHERE song_id = ? AND liker = ?", id, who);
    else this.sql.exec("INSERT INTO likes (song_id, liker) VALUES (?, ?)", id, who);
    return this.changed({ liked: !had });
  }

  remove(id, user, host) {
    const row = this.sql.exec("SELECT owner, status, track FROM songs WHERE id = ?", id).toArray()[0];
    if (!row) return { error: "That song is gone" };
    if (!host && (row.owner !== user.id || row.status !== "queued")) return { error: "You can only remove your own songs" };
    this.deleteSong(id);
    this.log(host ? "Host" : user.name, `removed ${JSON.parse(row.track).title}`);
    return this.changed();
  }

  // --- Host actions ---

  hostAction(body) {
    const id = String(body.id || "");
    switch (body.action) {
      case "next": {
        this.finishCurrent();
        const next = this.orderedQueue()[0];
        if (next) {
          this.sql.exec("UPDATE songs SET status = 'playing' WHERE id = ?", next.id);
          this.log("Host", `started ${next.title}`);
        }
        return this.changed();
      }
      case "play": {
        if (!this.exists(id)) return { error: "That song is gone" };
        this.finishCurrent();
        this.sql.exec("UPDATE songs SET status = 'playing' WHERE id = ?", id);
        return this.changed();
      }
      case "markPlayed": {
        this.sql.exec("UPDATE songs SET status = 'played', played_at = ? WHERE id = ?", Date.now(), id);
        return this.changed();
      }
      case "requeue": {
        const pos = this.sql.exec("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM songs").one().p;
        this.sql.exec("UPDATE songs SET status = 'queued', position = ?, played_at = NULL WHERE id = ?", pos, id);
        return this.changed();
      }
      case "playNext": {
        const pos = this.sql.exec("SELECT COALESCE(MIN(position), 0) - 1 AS p FROM songs").one().p;
        this.sql.exec("UPDATE songs SET position = ? WHERE id = ?", pos, id);
        return this.changed();
      }
      case "move": {
        const queue = this.rows("queued");
        const i = queue.findIndex((s) => s.id === id);
        const j = i + (body.dir === "up" ? -1 : 1);
        if (i < 0 || j < 0 || j >= queue.length) return { ok: true };
        const a = this.sql.exec("SELECT position FROM songs WHERE id = ?", queue[i].id).one().position;
        const b = this.sql.exec("SELECT position FROM songs WHERE id = ?", queue[j].id).one().position;
        this.sql.exec("UPDATE songs SET position = ? WHERE id = ?", b, queue[i].id);
        this.sql.exec("UPDATE songs SET position = ? WHERE id = ?", a, queue[j].id);
        return this.changed();
      }
      case "ban":
      case "unban": {
        const u = this.sql.exec("SELECT name FROM users WHERE id = ?", id || body.userId).toArray()[0];
        if (!u) return { error: "No such member" };
        const uid = id || body.userId;
        this.sql.exec("UPDATE users SET banned = ? WHERE id = ?", body.action === "ban" ? 1 : 0, uid);
        if (body.action === "ban") {
          this.sql.exec("DELETE FROM sessions WHERE user_id = ?", uid);
          if (body.removeSongs) {
            for (const r of this.sql.exec("SELECT id FROM songs WHERE owner = ? AND status = 'queued'", uid).toArray()) this.deleteSong(r.id);
          }
        }
        this.log("Host", `${body.action === "ban" ? "blocked" : "unblocked"} ${u.name}`);
        return this.changed();
      }
      case "deleteUser": {
        const uid = body.userId;
        const u = this.sql.exec("SELECT name FROM users WHERE id = ?", uid).toArray()[0];
        if (!u) return { error: "No such member" };
        for (const r of this.sql.exec("SELECT id FROM songs WHERE owner = ? AND status = 'queued'", uid).toArray()) this.deleteSong(r.id);
        this.sql.exec("DELETE FROM likes WHERE liker = ?", uid);
        this.sql.exec("DELETE FROM sessions WHERE user_id = ?", uid);
        this.sql.exec("DELETE FROM users WHERE id = ?", uid);
        this.log("Host", `deleted the account of ${u.name}`);
        return this.changed();
      }
      case "remove": {
        const row = this.sql.exec("SELECT track FROM songs WHERE id = ?", id).toArray()[0];
        if (!row) return { error: "That song is gone" };
        this.deleteSong(id);
        this.log("Host", `removed ${JSON.parse(row.track).title}`);
        return this.changed();
      }
      case "clearLog": {
        this.sql.exec("DELETE FROM events");
        return this.changed();
      }
      case "clearQueue": {
        for (const s of this.rows("queued")) this.deleteSong(s.id);
        return this.changed();
      }
      case "clearHistory": {
        for (const r of this.sql.exec("SELECT id FROM songs WHERE status = 'played'").toArray()) this.deleteSong(r.id);
        return this.changed();
      }
      case "settings": {
        const next = { ...this.settings() };
        const p = body.settings || {};
        if (typeof p.locked === "boolean") next.locked = p.locked;
        if (typeof p.blockExplicit === "boolean") next.blockExplicit = p.blockExplicit;
        if (p.sort === "added" || p.sort === "likes") next.sort = p.sort;
        if (Number.isInteger(p.maxPerPerson) && p.maxPerPerson >= 1 && p.maxPerPerson <= 50) {
          next.maxPerPerson = p.maxPerPerson;
        }
        if (typeof p.signupsOpen === "boolean") next.signupsOpen = p.signupsOpen;
        if (typeof p.signupCode === "string") next.signupCode = p.signupCode.trim().slice(0, 40);
        this.setMeta("settings", next);
        return this.changed();
      }
    }
    return { error: "Unknown action" };
  }

  // --- Accounts ---

  signup({ username, name, passHash, code, tokenHash }) {
    const s = this.settings();
    if (!s.signupsOpen) return { error: "Sign-ups are closed right now. Ask the host." };
    if (s.signupCode && code.trim().toLowerCase() !== s.signupCode.toLowerCase()) return { error: "Wrong class code" };
    if (this.sql.exec("SELECT 1 FROM users WHERE username = ?", username).toArray().length) return { error: "That username is taken" };
    const id = crypto.randomUUID();
    const now = Date.now();
    this.sql.exec("INSERT INTO users (id, username, name, pass_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)", id, username, name, passHash, now, now);
    this.sql.exec("INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)", tokenHash, id, now);
    this.log(name, `joined as @${username}`);
    this.changed();
    return { user: this.publicUser(id) };
  }

  accountForLogin(username) {
    return this.sql.exec("SELECT id, pass_hash, banned FROM users WHERE username = ?", username).toArray()[0] || null;
  }

  createSession(userId, tokenHash) {
    this.sql.exec("INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)", tokenHash, userId, Date.now());
    return this.publicUser(userId);
  }

  deleteSession(tokenHash) {
    this.sql.exec("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
  }

  userForSession(tokenHash) {
    const row = this.sql.exec("SELECT user_id FROM sessions WHERE token_hash = ?", tokenHash).toArray()[0];
    if (!row) return null;
    const now = Date.now();
    this.sql.exec("UPDATE users SET last_seen = ? WHERE id = ? AND last_seen < ?", now, row.user_id, now - 60000);
    return this.publicUser(row.user_id);
  }

  publicUser(id) {
    const u = this.sql.exec("SELECT id, username, name, banned FROM users WHERE id = ?", id).toArray()[0];
    return u ? { id: u.id, username: u.username, name: u.name, banned: Boolean(u.banned) } : null;
  }

  setPassword(userId, passHash) {
    const u = this.sql.exec("SELECT name FROM users WHERE id = ?", userId).toArray()[0];
    if (!u) return { error: "No such member" };
    this.sql.exec("UPDATE users SET pass_hash = ? WHERE id = ?", passHash, userId);
    this.sql.exec("DELETE FROM sessions WHERE user_id = ?", userId);
    this.log("Host", `reset the password of ${u.name}`);
    this.changed();
    return { ok: true };
  }

  // In-memory attempt counter (resets if the object restarts, which is fine for this).
  tooManyFails(key, limit) {
    const now = Date.now();
    const list = (this.fails.get(key) || []).filter((t) => now - t < FAIL_WINDOW_MS);
    this.fails.set(key, list);
    return list.length >= limit;
  }

  recordFail(key) {
    const list = this.fails.get(key) || [];
    list.push(Date.now());
    this.fails.set(key, list);
  }

  clearFails(key) {
    this.fails.delete(key);
  }

  // --- Dashboard ---

  log(who, text) {
    this.sql.exec("INSERT INTO events (at, who, text) VALUES (?, ?, ?)", Date.now(), who, text);
    this.sql.exec("DELETE FROM events WHERE id <= (SELECT MAX(id) - 300 FROM events)");
  }

  adminOverview() {
    const users = this.sql
      .exec(
        `SELECT u.id, u.username, u.name, u.created_at, u.last_seen, u.banned,
                (SELECT COUNT(*) FROM songs s WHERE s.owner = u.id) AS songs,
                (SELECT COUNT(*) FROM songs s WHERE s.owner = u.id AND s.status = 'queued') AS waiting,
                (SELECT COUNT(*) FROM likes l WHERE l.liker = u.id) AS likes_given
         FROM users u ORDER BY u.created_at DESC`,
      )
      .toArray()
      .map((u) => ({ ...u, banned: Boolean(u.banned) }));
    const dayAgo = Date.now() - 86400000;
    const one = (q, ...a) => this.sql.exec(q, ...a).one().n;
    return {
      ...this.getState(),
      settings: this.settings(),
      users,
      events: this.sql.exec("SELECT at, who, text FROM events ORDER BY id DESC LIMIT 100").toArray(),
      stats: {
        members: users.length,
        activeToday: users.filter((u) => u.last_seen > dayAgo).length,
        queued: one("SELECT COUNT(*) AS n FROM songs WHERE status = 'queued'"),
        played: one("SELECT COUNT(*) AS n FROM songs WHERE status = 'played'"),
        addedToday: one("SELECT COUNT(*) AS n FROM songs WHERE added_at > ?", dayAgo),
        likes: one("SELECT COUNT(*) AS n FROM likes"),
      },
    };
  }

  finishCurrent() {
    this.sql.exec("UPDATE songs SET status = 'played', played_at = ? WHERE status = 'playing'", Date.now());
  }

  exists(id) {
    return this.sql.exec("SELECT 1 FROM songs WHERE id = ?", id).toArray().length > 0;
  }

  deleteSong(id) {
    this.sql.exec("DELETE FROM likes WHERE song_id = ?", id);
    this.sql.exec("DELETE FROM songs WHERE id = ?", id);
  }
}
