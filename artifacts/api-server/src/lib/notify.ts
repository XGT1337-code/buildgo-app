import { pool } from "@workspace/db";
import { publish } from "./realtime";

/** Tells every admin's open devices that something new is waiting for review. */
export async function notifyAdmins(event: Record<string, unknown>) {
  const { rows } = await pool.query("SELECT id FROM users WHERE role='admin' AND NOT banned");
  publish(rows.map((r) => r.id as string), event);
}
