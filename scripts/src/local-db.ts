/**
 * Local PostgreSQL for development: a real Postgres server from the embedded-postgres package,
 * no system install needed. Data lives in <repo>/.data/postgres and survives restarts.
 *
 * Reads DATABASE_URL from the root .env for port, user, password and database name, so the
 * API server and this process always agree. Swap DATABASE_URL for a hosted Postgres (Neon,
 * Supabase…) and this script is no longer needed.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const url = new URL(process.env.DATABASE_URL ?? "");
if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("Set DATABASE_URL in the root .env");

const databaseDir = path.join(root, ".data", "postgres");
const fresh = !existsSync(path.join(databaseDir, "PG_VERSION"));
const database = url.pathname.slice(1) || "agrigo";

const pg = new EmbeddedPostgres({
  databaseDir,
  port: Number(url.port || 5432),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  persistent: true,
  // Without this initdb picks the Windows code page (WIN1252) and rejects Azerbaijani/Russian text.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase(database);
console.log(`[local-db] PostgreSQL ready on 127.0.0.1:${url.port} (database "${database}", data in .data/postgres)`);

const stop = async () => { await pg.stop().catch(() => {}); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
