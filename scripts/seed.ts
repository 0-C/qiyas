import { getPool } from "../netlify/functions/_shared/db";
import { getEnv } from "../netlify/functions/_shared/env";
import { seedDemo } from "../netlify/functions/_shared/seed";
import { loadEnvFile } from "./load-env";

loadEnvFile();

try {
  const origin = getEnv("PUBLIC_BASE_URL") || "http://localhost:5173";
  const result = await seedDemo(origin, true);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await getPool().end();
}
