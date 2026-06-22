export default async function handler(req, res) {
  const { connectDatabase } = await import("../dist/db.js");
  const { buildApp } = await import("../dist/server-app.js");

  await connectDatabase();
  const app = await buildApp();
  await app.ready();

  app.server.emit("request", req, res);
}
