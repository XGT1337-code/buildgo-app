import { createServer } from "node:http";
import { migrate, pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { attachRealtime } from "./lib/realtime";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** The admin account comes from ADMIN_USERNAME + ADMIN_PASSWORD_HASH (a scrypt hash, never a plain password). */
async function seedAdmin() {
  const username = process.env.ADMIN_USERNAME?.trim().toLowerCase();
  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!username || !hash?.startsWith("scrypt$")) return;
  const prev = (await pool.query("SELECT password_hash FROM users WHERE username=$1", [username])).rows[0];
  const { rows } = await pool.query(
    `INSERT INTO users(username,first_name,last_name,password_hash,role) VALUES($1,'Admin','BuildGO',$2,'admin')
     ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, role='admin', banned=false,
       last_name=CASE WHEN users.last_name='AgriGO' THEN 'BuildGO' ELSE users.last_name END RETURNING id`,
    [username, hash]);
  // A new admin password signs out every device that used the old one.
  if (prev && prev.password_hash !== hash) await pool.query("DELETE FROM sessions WHERE user_id=$1", [rows[0].id]);
  logger.info({ username }, "Admin account ready");
}

await migrate(pool);
await seedAdmin();

const server = createServer(app);
attachRealtime(server);
server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
});
