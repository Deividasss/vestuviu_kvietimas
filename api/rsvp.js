/**
 * Vercel Serverless Function: POST /api/rsvp
 *
 * Notes:
 * - This is a minimal "receiver" endpoint so the frontend can submit RSVP.
 * - For persistence, later plug in DB / email / Google Sheets / etc.
 */

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
  // Optional CORS (useful if you later call from another domain)
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

  // Minimal "storage": logs (visible in Vercel function logs).
  // Later: write to DB / queue / email.
  console.log("[RSVP]", {
    submittedAtISO: body.submittedAtISO || new Date().toISOString(),
    wedding: body.wedding || null,
    rsvp: {
      name,
      attending,
      guests,
      diet: rsvp.diet || "",
      note: rsvp.note || "",
    },
    source: body.source || "web",
  });

  return res.status(200).json({ ok: true });
};
