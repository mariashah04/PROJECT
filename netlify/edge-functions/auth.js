function redirectToLogin(request) {
  const loginUrl = new URL("/", request.url);
  return Response.redirect(loginUrl, 302);
}

export default async (request, context) => {
  const token = context.cookies.get("session");
  const secret = Deno.env.get("SESSION_SECRET");

  if (!token || !secret) {
    return redirectToLogin(request);
  }

  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    return redirectToLogin(request);
  }

  let payload;
  try {
    const base64Token = token.replace(/-/g, "+").replace(/_/g, "/");
    const tokenBytes = atob(
      base64Token + "=".repeat((4 - (base64Token.length % 4)) % 4),
    );
    payload = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(tokenBytes, (character) => character.charCodeAt(0)),
    );
  } catch {
    return redirectToLogin(request);
  }

  const signatureSeparator = payload.lastIndexOf(".");
  if (signatureSeparator <= 0) {
    return redirectToLogin(request);
  }

  const payloadText = payload.slice(0, signatureSeparator);
  const signatureHex = payload.slice(signatureSeparator + 1);
  if (!/^[a-f\d]{64}$/i.test(signatureHex)) {
    return redirectToLogin(request);
  }

  const payloadSeparator = payloadText.lastIndexOf(".");
  if (payloadSeparator <= 0) {
    return redirectToLogin(request);
  }

  const username = payloadText.slice(0, payloadSeparator);
  const expiry = Number(payloadText.slice(payloadSeparator + 1));
  if (!username || !Number.isSafeInteger(expiry) || expiry <= Date.now()) {
    return redirectToLogin(request);
  }

  const signature = new Uint8Array(
    signatureHex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(payloadText),
  );

  if (!valid) {
    return redirectToLogin(request);
  }

  return context.next();
};
export const config = { path: ["/dashboard", "/dashboard.html"] };
