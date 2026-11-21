import { Router } from "express";
import { pool } from "@workspace/db";
import { DecideReviewBody, ListAdminUsersQueryParams, UpdateAdminUserBody } from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../lib/auth";
import { disconnect, isOnline, onlineCount, publish } from "../lib/realtime";
import { isUuid } from "../lib/sql";
import { listingSql, shapeListing } from "./listings";
import { licenseCols, vehicleCols } from "./verification";

/** Account management. Admins see accounts and totals, never the content of private chats. */
const router = Router();
router.use("/admin", requireAuth, requireAdmin);

const adminUserCols = `id, username, first_name AS "firstName", last_name AS "lastName", role, banned,
  created_at AS "createdAt", last_seen_at AS "lastSeenAt"`;
const withOnline = <T extends { id: string }>(u: T) => ({ ...u, online: isOnline(u.id) });

router.get("/admin/stats", async (_req, res) => {
  const { rows } = await pool.query(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM users WHERE role='admin') AS admins,
    (SELECT count(*)::int FROM users WHERE banned) AS banned,
    (SELECT count(*)::int FROM users WHERE created_at > date_trunc('day', now())) AS "signupsToday",
    (SELECT count(*)::int FROM chat_conversations) AS conversations,
    (SELECT count(*)::int FROM chat_messages) AS messages,
    (SELECT count(*)::int FROM chat_messages WHERE kind='voice') AS "voiceMessages",
    (SELECT count(*)::int FROM chat_requests WHERE status='pending') AS "pendingRequests",
    (SELECT count(*)::int FROM listings WHERE status='approved') AS listings,
    (SELECT (SELECT count(*) FROM listings WHERE status='pending') + (SELECT count(*) FROM vehicles WHERE status='pending')
      + (SELECT count(*) FROM licenses WHERE status='pending'))::int AS "pendingReviews"`);
  res.json({ ...rows[0], online: onlineCount() });
});

router.get("/admin/users", async (req, res) => {
  const parsed = ListAdminUsersQueryParams.safeParse(req.query);
  const q = parsed.success ? (parsed.data.q ?? "").trim().toLowerCase() : "";
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await pool.query(`SELECT ${adminUserCols} FROM users
    WHERE $1='' OR lower(first_name || ' ' || last_name || ' ' || username) LIKE $2
    ORDER BY created_at DESC LIMIT 200`, [q, like]);
  res.json(rows.map(withOnline));
});

router.patch("/admin/users/:id", async (req, res) => {
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!isUuid(req.params.id) || !parsed.success) { res.status(400).json({ error: "Nothing to change." }); return; }
  if (req.params.id === req.user!.id) { res.status(400).json({ error: "You cannot change your own admin account here." }); return; }
  const { banned, role } = parsed.data;
  const { rows } = await pool.query(`UPDATE users SET banned=COALESCE($2,banned), role=COALESCE($3,role) WHERE id=$1 RETURNING ${adminUserCols}`,
    [req.params.id, banned ?? null, role ?? null]);
  if (!rows[0]) { res.status(404).json({ error: "User not found." }); return; }
  if (banned) {
    await pool.query("DELETE FROM sessions WHERE user_id=$1", [req.params.id]);
    disconnect(req.params.id);
  }
  res.json(withOnline(rows[0]));
});

// ------------------------------------------------------------------ moderation queue

const ownerJson = (u: string) => `json_build_object('id',${u}.id,'firstName',${u}.first_name,'lastName',${u}.last_name,'username',${u}.username)`;

router.get("/admin/reviews", async (req, res) => {
  const [listings, vehicles, licenses] = await Promise.all([
    pool.query(`${listingSql} WHERE l.status='pending' ORDER BY l.created_at`),
    pool.query(`SELECT ${vehicleCols("v")}, ${ownerJson("u")} AS owner FROM vehicles v JOIN users u ON u.id=v.owner_id WHERE v.status='pending' ORDER BY v.created_at`),
    pool.query(`SELECT ${licenseCols("l")}, ${ownerJson("u")} AS owner FROM licenses l JOIN users u ON u.id=l.user_id WHERE l.status='pending' ORDER BY l.created_at`),
  ]);
  res.json({ listings: listings.rows.map((r) => shapeListing(r, req.user!)), vehicles: vehicles.rows, licenses: licenses.rows });
});

const REVIEW_TABLE = { listing: ["listings", "owner_id"], vehicle: ["vehicles", "owner_id"], license: ["licenses", "user_id"] } as const;

router.post("/admin/reviews/:kind/:id", async (req, res) => {
  const kind = req.params.kind as keyof typeof REVIEW_TABLE;
  const parsed = DecideReviewBody.safeParse(req.body);
  if (!(kind in REVIEW_TABLE) || !isUuid(req.params.id) || !parsed.success) { res.status(400).json({ error: "Choose approve or reject." }); return; }
  const { decision, note } = parsed.data;
  if (decision === "reject" && !note?.trim()) { res.status(400).json({ error: "Write the reason, so the owner knows what to fix." }); return; }
  if (kind === "listing" && decision === "approve") {
    // A machine listing goes live only with a verified machine behind it.
    const { rows } = await pool.query("SELECT v.status FROM listings l LEFT JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id=$1 AND l.vehicle_id IS NOT NULL", [req.params.id]);
    if (rows[0] && rows[0].status !== "approved") { res.status(409).json({ error: "Approve the machine (VIN, plate, documents) first." }); return; }
  }
  const [table, ownerCol] = REVIEW_TABLE[kind];
  const status = decision === "approve" ? "approved" : "rejected";
  const { rows } = await pool.query(
    `UPDATE ${table} SET status=$2, review_note=$3, reviewed_by=$4, reviewed_at=now() WHERE id=$1 AND status='pending' RETURNING ${ownerCol} AS owner`,
    [req.params.id, status, note?.trim() || null, req.user!.id]);
  if (!rows[0]) { res.status(404).json({ error: "Already decided or deleted." }); return; }
  publish(rows[0].owner, { type: "review", kind, id: req.params.id, status, note: note?.trim() || null });
  res.status(204).end();
});

router.delete("/admin/users/:id", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).json({ error: "User not found." }); return; }
  if (req.params.id === req.user!.id) { res.status(400).json({ error: "You cannot delete your own admin account." }); return; }
  // Voice blobs are referenced by messages (ON DELETE SET NULL), so remove them explicitly first.
  await pool.query(`DELETE FROM chat_audio WHERE id IN (SELECT m.audio_id FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id
    WHERE c.user_a=$1 OR c.user_b=$1)`, [req.params.id]);
  await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  disconnect(req.params.id);
  res.status(204).end();
});

export default router;
