import { createServer } from "node:http";
import { ensureReady } from "../netlify/functions/_shared/db";
import { handle } from "../netlify/functions/_shared/router";
import { loadEnvFile } from "./load-env";

loadEnvFile();

const port = Number(process.env.API_PORT || 8787);

await ensureReady();

const server = createServer(async (req, res) => {
  try {
    const host = req.headers.host || `127.0.0.1:${port}`;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const headers = new Headers();
    for (const key of ["content-type", "accept", "origin"]) {
      const value = req.headers[key];
      if (typeof value === "string") headers.set(key, value);
    }
    const request = new Request(`http://${host}${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await handle(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key === "content-encoding") return;
      res.setHeader(key, value);
    });
    const payload = Buffer.from(await response.arrayBuffer());
    res.end(payload);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Something went wrong." }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Qiyas API on http://127.0.0.1:${port}`);
});
