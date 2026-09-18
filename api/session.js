const crypto = require("crypto");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getSession(req) {
  const cookies = Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1).trim())];
  }));
  const token = cookies.billing_session;
  if (!token || !process.env.AUTH_SECRET) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return session.exp > Date.now() ? session : null;
  } catch {
    return null;
  }
}

module.exports = function handler(req, res) {
  if (req.method === "GET") {
    const session = getSession(req);
    return json(res, session ? 200 : 401, session ? { user: session } : { error: "Belum login" });
  }
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", "billing_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: "Method tidak diizinkan" });
};
