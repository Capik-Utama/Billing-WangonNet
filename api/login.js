const crypto = require("crypto");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method tidak diizinkan" });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.AUTH_SECRET) {
    return json(res, 500, { error: "Konfigurasi autentikasi belum lengkap" });
  }

  try {
    const { username, password } = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    if (!username || !password) return json(res, 400, { error: "Username dan password wajib diisi" });

    const response = await fetch(new URL("/rest/v1/rpc/verify_app_user", process.env.SUPABASE_URL), {
      method: "POST",
      body: JSON.stringify({ p_username: String(username), p_password: String(password) }),
      headers: {
        apikey: process.env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) return json(res, 502, { error: "Supabase tidak dapat dihubungi" });
    const user = await response.json();
    if (!user) {
      return json(res, 401, { error: "Username atau password salah" });
    }

    const session = signSession({
      sub: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      exp: Date.now() + 8 * 60 * 60 * 1000,
    });
    res.setHeader("Set-Cookie", `billing_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`);
    return json(res, 200, { user: { username: user.username, displayName: user.display_name, role: user.role } });
  } catch {
    return json(res, 400, { error: "Permintaan login tidak valid" });
  }
};
