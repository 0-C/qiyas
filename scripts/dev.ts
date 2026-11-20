import { spawn } from "node:child_process";
import net from "node:net";
import { loadEnvFile } from "./load-env";

loadEnvFile();

function waitForPort(port: number): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - started > 15_000) reject(new Error("The API did not start."));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

const api = spawn("npx", ["tsx", "scripts/dev-server.ts"], { stdio: "inherit" });
const vite = spawn("npx", ["vite", "--host", "0.0.0.0", "--port", "5173"], { stdio: "inherit" });

function stop(code = 0) {
  api.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exit(code);
}

api.on("exit", (code) => {
  if (code && code !== 0) stop(code);
});
vite.on("exit", (code) => {
  if (code && code !== 0) stop(code);
});
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

waitForPort(8787).catch((error) => {
  console.error(error);
  stop(1);
});
