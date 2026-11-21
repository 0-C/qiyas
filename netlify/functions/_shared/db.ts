import pg from "pg";
import { HttpError } from "./domain";
import { getEnv } from "./env";
import { SCHEMA_SQL } from "./schema";

const { Pool } = pg;

let pool: pg.Pool | null = null;
let ready: Promise<void> | null = null;

function sslFor(connectionString: string): pg.PoolConfig["ssl"] {
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(connectionString);
  if (local && !/sslmode=require/.test(connectionString)) return undefined;
  return { rejectUnauthorized: false };
}

export function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = getEnv("DATABASE_URL");
  if (!connectionString) {
    throw new HttpError(500, "DATABASE_URL is not set.");
  }
  // One pool per isolate. Netlify keeps this module in memory across warm invocations.
  pool = new Pool({
    connectionString,
    ssl: sslFor(connectionString),
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on("error", (error) => {
    console.error("Postgres pool error", error);
  });
  return pool;
}

export async function raw<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  try {
    const result = await getPool().query(sql, params);
    return result.rows as T[];
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const message = error instanceof Error ? error.message : "Database error";
    if (/password authentication failed|ECONNREFUSED|ENOTFOUND|getaddrinfo|no pg_hba.conf/i.test(message)) {
      throw new HttpError(503, "Could not reach the database. Check DATABASE_URL.");
    }
    throw error;
  }
}

export async function withTx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection may already be closed.
    }
    throw error;
  } finally {
    client.release();
  }
}

function schemaStatements(): string[] {
  return SCHEMA_SQL.split(";")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

const EXTRA_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS orders_piece_label_idx ON orders (shop_id, piece_label) WHERE piece_label IS NOT NULL
`;

export async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const existing = await raw<{ ok: string | null }>("SELECT to_regclass('public.shops')::text AS ok");
      if (!existing[0]?.ok) {
        for (const statement of schemaStatements()) {
          await raw(statement);
        }
      }
      await raw(EXTRA_INDEX_SQL);
      const { ensureShop } = await import("./shop");
      await ensureShop();
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}
