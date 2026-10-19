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

  if (path === "/api/ws") {
    if (request.headers.get("Upgrade") !== "websocket") throw new HttpError(426, "Expected a WebSocket");
    return room.fetch(request);
  }
  if (path === "/api/state" && method === "GET") return json(await room.getState());
  if (path === "/api/search" && method === "GET") return json(await search(url.searchParams.get("q"), request, env, ctx));
  if (path === "/api/top" && method === "GET") return json(await topCharts(request, env, ctx));

  if (method !== "POST") throw new HttpError(404, "Not found");
  const body = await readBody(request);
  const who = await publicId(body.clientKey);
  const host = await isHost(request, env);

  switch (path) {
    case "/api/add": {
      const name = cleanName(body.name);
      const track = await lookupTrack(body.trackId, request, env, ctx);
      return result(await room.add({ track, name, who, host }));
    }
    case "/api/like":
      return result(await room.like(String(body.id || ""), who));
    case "/api/remove":
      return result(await room.remove(String(body.id || ""), who, host));
    case "/api/host/login":
      if (!env.HOST_PIN) throw new HttpError(400, "No host PIN set yet. Run: npx wrangler secret put HOST_PIN");
      if (!host) throw new HttpError(403, "Wrong PIN");
      return json({ ok: true });
    case "/api/host/action":
      if (!host) throw new HttpError(403, "Host PIN required");
      return result(await room.hostAction(body));
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

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Each phone keeps a secret random key. Everyone else only ever sees a hash of
// it, so you can delete your own songs but can't pretend to be someone else.
async function publicId(clientKey) {
  clientKey = String(clientKey || "");
  if (clientKey.length < 16 || clientKey.length > 64) throw new HttpError(400, "Reload the page and try again");
  return (await sha256Hex(clientKey)).slice(0, 16);
}

async function isHost(request, env) {
  const pin = request.headers.get("X-Host-Pin");
  if (!pin || !env.HOST_PIN) return false;
  const [a, b] = await Promise.all([sha256Hex(pin), sha256Hex(env.HOST_PIN)]);
  const enc = new TextEncoder();
  return crypto.subtle.timingSafeEqual(enc.encode(a), enc.encode(b));
}

// ---------------------------------------------------------------------------
// Room: the single shared queue, stored in a SQLite-backed Durable Object.
// Phones hold a WebSocket open and get the new queue pushed on every change.
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = { locked: false, blockExplicit: true, sort: "added", maxPerPerson: null };

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.lastAdd = new Map();
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
    const settings = this.settings();
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

  add({ track, name, who, host }) {
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
    return this.changed({ id });
  }

  like(id, who) {
    if (!this.exists(id)) return { error: "That song is gone" };
    const had = this.sql.exec("SELECT 1 FROM likes WHERE song_id = ? AND liker = ?", id, who).toArray().length;
    if (had) this.sql.exec("DELETE FROM likes WHERE song_id = ? AND liker = ?", id, who);
    else this.sql.exec("INSERT INTO likes (song_id, liker) VALUES (?, ?)", id, who);
    return this.changed({ liked: !had });
  }

  remove(id, who, host) {
    const row = this.sql.exec("SELECT owner, status FROM songs WHERE id = ?", id).toArray()[0];
    if (!row) return { error: "That song is gone" };
    if (!host && (row.owner !== who || row.status !== "queued")) return { error: "You can only remove your own songs" };
    this.deleteSong(id);
    return this.changed();
  }

  // --- Host actions ---

  hostAction(body) {
    const id = String(body.id || "");
    switch (body.action) {
      case "next": {
        this.finishCurrent();
        const next = this.orderedQueue()[0];
        if (next) this.sql.exec("UPDATE songs SET status = 'playing' WHERE id = ?", next.id);
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
        this.setMeta("settings", next);
        return this.changed();
      }
    }
    return { error: "Unknown action" };
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
