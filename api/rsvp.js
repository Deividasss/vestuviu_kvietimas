/**
 * Vercel Serverless Function: POST /api/rsvp
 *
 * Notes:
 * - This endpoint is used by the frontend in production (same-origin) to avoid CORS.
 * - It proxies the request to the Railway backend (server-to-server).
 */

const DEFAULT_RAILWAY_BASE_URL = "https://vestuviubackend-production.up.railway.app";

function normalizeBaseUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, "");
}

function joinUrl(base, path) {
  const b = normalizeBaseUrl(base);
  const p = String(path || "").trim();
  if (!b) return p;
  if (/^https?:\/\//i.test(p)) return p;
  return `${b}${p.startsWith("/") ? p : `/${p}`}`;
}

function readJsonBody(req) {
  // On Vercel, req.body is usually already parsed for JSON.
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

module.exports = async (req, res) => {
  // Same-origin on Vercel, but keep permissive headers for safety.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  const body = await readJsonBody(req);
  const rsvp = body && body.rsvp;

  const name = (rsvp && typeof rsvp.name === "string" && rsvp.name.trim()) || "";
  const attending = (rsvp && typeof rsvp.attending === "string" && rsvp.attending.trim()) || "";
  const guests = rsvp && Number(rsvp.guests);

  if (!name || !attending || !Number.isFinite(guests)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid RSVP payload",
    });
  }

  const targetBase = process.env.RSVP_PROXY_TARGET_BASE_URL || DEFAULT_RAILWAY_BASE_URL;
  const targetUrl = joinUrl(targetBase, "/api/rsvp");

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const contentType = upstreamRes.headers.get("content-type") || "";
    const upstreamBody = contentType.includes("application/json")
      ? await upstreamRes.json().catch(() => null)
      : await upstreamRes.text().catch(() => null);

    if (!upstreamRes.ok) {
      return res.status(upstreamRes.status).json({
        ok: false,
        error:
          (upstreamBody && upstreamBody.error) ||
          (typeof upstreamBody === "string" && upstreamBody) ||
          `Upstream error (${upstreamRes.status})`,
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[RSVP proxy error]", e);
    return res.status(502).json({ ok: false, error: "RSVP proxy failed" });
  }
};
