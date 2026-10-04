const crypto = require("crypto");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: "Method not allowed" };

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Bad request" };
  }

  const { username, password } = body;

  const ok =
    typeof username === "string" &&
    typeof password === "string" &&
    safeEqual(username, process.env.DEMO_USER || "") &&
    safeEqual(password, process.env.DEMO_PASS || "");

  if (!ok) {
    await new Promise((r) => setTimeout(r, 800));
    return json(401, { error: "Invalid username or password" });
  }

  const exp = Date.now() + 2 * 60 * 60 * 1000;
  const payload = `${username}.${exp}`;
  const sig = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(payload)
    .digest("hex");
  const token = Buffer.from(`${payload}.${sig}`).toString("base64url");

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200`,
    },
    body: JSON.stringify({ ok: true }),
  };
};

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  };
}
