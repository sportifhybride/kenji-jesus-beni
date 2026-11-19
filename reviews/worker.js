/* INNÉ — website worker.
   Serves the static site and a small reviews API backed by Cloudflare D1 (binding: DB).

   Public
     GET  /api/reviews                     published reviews + stats
     POST /api/reviews                     submit a review with a one-time client code (stays pending)
   Admin (header "Authorization: Bearer <password>")
     GET  /api/admin/reviews?status=...    pending | published | rejected | all
     POST /api/admin/reviews/:id           { action: publish | reject | delete | reply, reply }
     GET  /api/admin/codes                 list client codes
     POST /api/admin/codes                 { label, count } create codes
     POST /api/admin/codes/delete          { code } remove an unused code
     POST /api/admin/password              { password } change the admin password   */

const OFFERS = ["guide", "program", "private"];
const LANGS = ["en", "es", "fr", "sv", "de", "it"];
const MAX_FAILS = 8, FAIL_WINDOW = 15 * 60; // seconds

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (e) {
      return json({ error: "server" }, 500);
    }
  },
};

async function route(request, env, url) {
  const p = url.pathname.replace(/\/+$/, "");
  const m = request.method;
  if (p === "/api/reviews" && m === "GET") return listPublished(env, url);
  if (p === "/api/reviews" && m === "POST") return submit(request, env);
  if (p.startsWith("/api/admin/")) {
    const auth = await checkAdmin(request, env);
    if (auth) return auth;
    if (p === "/api/admin/login" && m === "POST") return json({ ok: true });
    if (p === "/api/admin/reviews" && m === "GET") return adminList(env, url);
    const rm = p.match(/^\/api\/admin\/reviews\/(\d+)$/);
    if (rm && m === "POST") return adminAction(request, env, Number(rm[1]));
    if (p === "/api/admin/codes" && m === "GET") return listCodes(env);
    if (p === "/api/admin/codes" && m === "POST") return createCodes(request, env);
    if (p === "/api/admin/codes/delete" && m === "POST") return deleteCode(request, env);
    if (p === "/api/admin/password" && m === "POST") return changePassword(request, env);
  }
  return json({ error: "not_found" }, 404);
}

/* ---------- helpers ---------- */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
async function body(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 20000) return null;
  try { return await request.json(); } catch (e) { return null; }
}
const now = () => new Date().toISOString();
const clean = (s, max) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
function fmtCode(raw) { return "INNE-" + raw.slice(0, 4) + "-" + raw.slice(4, 8); }

/* ---------- public ---------- */
async function listPublished(env, url) {
  const sort = url.searchParams.get("sort");
  const offer = url.searchParams.get("offer");
  const order = sort === "best" ? "rating DESC, published_at DESC" : sort === "oldest" ? "published_at ASC" : "published_at DESC";
  const where = ["status = 'published'"], args = [];
  if (OFFERS.includes(offer)) { where.push("offer = ?"); args.push(offer); }
  const rows = await env.DB.prepare(
    `SELECT id, name, offer, rating, body, lang, reply, reply_at, published_at FROM reviews WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT 200`
  ).bind(...args).all();
  const st = await env.DB.prepare("SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE status = 'published'").first();
  return json({ reviews: rows.results || [], count: st.n || 0, average: st.avg ? Math.round(st.avg * 10) / 10 : null });
}

async function submit(request, env) {
  const b = await body(request);
  if (!b) return json({ error: "invalid" }, 400);
  if (b.website) return json({ ok: true }); // honeypot: silently ignore bots
  const code = normCode(b.code).replace(/^INNE/, "");
  const name = clean(b.name, 40);
  const offer = String(b.offer || "");
  const rating = Number(b.rating);
  const text = clean(b.body, 2000);
  const lang = LANGS.includes(b.lang) ? b.lang : "en";
  if (code.length !== 8) return json({ error: "code" }, 400);
  if (name.length < 2 || !OFFERS.includes(offer) || !(rating >= 1 && rating <= 5) || text.length < 30) return json({ error: "invalid" }, 400);
  if (!b.consent) return json({ error: "consent" }, 400);
  const fc = fmtCode(code);
  const row = await env.DB.prepare("SELECT code, used_at FROM codes WHERE code = ?").bind(fc).first();
  if (!row) return json({ error: "code" }, 400);
  if (row.used_at) return json({ error: "code_used" }, 400);
  // claim the code atomically, then store the review
  const claim = await env.DB.prepare("UPDATE codes SET used_at = ? WHERE code = ? AND used_at IS NULL").bind(now(), fc).run();
  if (!claim.meta || claim.meta.changes !== 1) return json({ error: "code_used" }, 400);
  const ins = await env.DB.prepare(
    "INSERT INTO reviews (name, offer, rating, body, lang, status, code, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)"
  ).bind(name, offer, Math.round(rating), text, lang, fc, now()).run();
  await env.DB.prepare("UPDATE codes SET review_id = ? WHERE code = ?").bind(ins.meta.last_row_id, fc).run();
  return json({ ok: true });
}

/* ---------- admin auth ---------- */
async function checkAdmin(request, env) {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const t = Math.floor(Date.now() / 1000);
  const a = await env.DB.prepare("SELECT count, first_at FROM attempts WHERE ip = ?").bind(ip).first();
  if (a && a.count >= MAX_FAILS && t - a.first_at < FAIL_WINDOW) return json({ error: "locked" }, 429);
  const h = request.headers.get("authorization") || "";
  const pw = h.startsWith("Bearer ") ? h.slice(7) : "";
  const stored = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_hash'").first();
  if (pw && stored && (await verify(pw, stored.value))) {
    if (a) await env.DB.prepare("DELETE FROM attempts WHERE ip = ?").bind(ip).run();
    return null;
  }
  if (!a || t - a.first_at >= FAIL_WINDOW) await env.DB.prepare("INSERT OR REPLACE INTO attempts (ip, count, first_at) VALUES (?, 1, ?)").bind(ip, t).run();
  else await env.DB.prepare("UPDATE attempts SET count = count + 1 WHERE ip = ?").bind(ip).run();
  return json({ error: "auth" }, 401);
}
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(pw, salt, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256);
}
async function verify(pw, stored) {
  const [kind, iter, salt, hash] = stored.split("$");
  if (kind !== "pbkdf2") return false;
  const got = new Uint8Array(await derive(pw, unb64(salt), Number(iter)));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}
async function changePassword(request, env) {
  const b = await body(request);
  const pw = b && String(b.password || "");
  if (!pw || pw.length < 10) return json({ error: "weak" }, 400);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pw, salt, 100000);
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_hash', ?)").bind(`pbkdf2$100000$${b64(salt)}$${b64(hash)}`).run();
  return json({ ok: true });
}

/* ---------- admin: reviews ---------- */
async function adminList(env, url) {
  const s = url.searchParams.get("status");
  const where = ["pending", "published", "rejected"].includes(s) ? "WHERE status = ?" : "";
  const stmt = env.DB.prepare(`SELECT * FROM reviews ${where} ORDER BY created_at DESC LIMIT 500`);
  const rows = await (where ? stmt.bind(s) : stmt).all();
  const counts = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM reviews GROUP BY status").all();
  const c = {}; (counts.results || []).forEach((r) => (c[r.status] = r.n));
  return json({ reviews: rows.results || [], counts: c });
}
async function adminAction(request, env, id) {
  const b = await body(request);
  if (!b) return json({ error: "invalid" }, 400);
  const r = await env.DB.prepare("SELECT id FROM reviews WHERE id = ?").bind(id).first();
  if (!r) return json({ error: "not_found" }, 404);
  if (b.action === "publish") await env.DB.prepare("UPDATE reviews SET status = 'published', published_at = COALESCE(published_at, ?) WHERE id = ?").bind(now(), id).run();
  else if (b.action === "reject") await env.DB.prepare("UPDATE reviews SET status = 'rejected' WHERE id = ?").bind(id).run();
  else if (b.action === "delete") await env.DB.prepare("DELETE FROM reviews WHERE id = ?").bind(id).run();
  else if (b.action === "reply") {
    const reply = clean(b.reply, 2000);
    await env.DB.prepare("UPDATE reviews SET reply = ?, reply_at = ? WHERE id = ?").bind(reply || null, reply ? now() : null, id).run();
  } else return json({ error: "invalid" }, 400);
  return json({ ok: true });
}

/* ---------- admin: client codes ---------- */
async function listCodes(env) {
  const rows = await env.DB.prepare("SELECT code, label, created_at, used_at, review_id FROM codes ORDER BY created_at DESC LIMIT 500").all();
  return json({ codes: rows.results || [] });
}
async function createCodes(request, env) {
  const b = (await body(request)) || {};
  const n = Math.max(1, Math.min(20, Number(b.count) || 1));
  const label = clean(b.label, 80);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  const made = [];
  for (let k = 0; k < n; k++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const raw = Array.from(bytes, (x) => alphabet[x % alphabet.length]).join("");
    const code = fmtCode(raw);
    await env.DB.prepare("INSERT OR IGNORE INTO codes (code, label, created_at) VALUES (?, ?, ?)").bind(code, label || null, now()).run();
    made.push(code);
  }
  return json({ codes: made });
}
async function deleteCode(request, env) {
  const b = (await body(request)) || {};
  await env.DB.prepare("DELETE FROM codes WHERE code = ? AND used_at IS NULL").bind(String(b.code || "")).run();
  return json({ ok: true });
}
