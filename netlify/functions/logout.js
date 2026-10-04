exports.handler = async () => ({
  statusCode: 200,
  headers: {
    "Set-Cookie": "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  },
  body: "ok",
});
