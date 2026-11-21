import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { pool } from "@workspace/db";
import { ChangePasswordBody, CheckUsernameQueryParams, LoginBody, RegisterBody } from "@workspace/api-zod";
import { bearer, createSession, endSession, meSql, requireAuth } from "../lib/auth";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../lib/password";
import { disconnect } from "../lib/realtime";

const router = Router();
const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;
const RESERVED = new Set(["admin", "root", "support", "agrigo", "buildgo", "system", "moderator"]);
const normalize = (s: string) => s.trim().replace(/^@/, "").toLowerCase();
const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");

const loginLimit = rateLimit({
  windowMs: 10 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Try again in a few minutes." },
});
const registerLimit = rateLimit({
  windowMs: 60 * 60_000, limit: 15, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many new accounts from this network. Try again later." },
});

function usernameProblem(username: string): string | null {
  if (!USERNAME_RE.test(username)) return "Use 3–24 Latin letters, numbers, dots or underscores.";
  if (RESERVED.has(username)) return "This username is reserved.";
  return null;
}

router.get("/auth/username-available", async (req, res) => {
  const parsed = CheckUsernameQueryParams.safeParse(req.query);
  const username = normalize(parsed.success ? parsed.data.username : "");
  const problem = usernameProblem(username);
  if (problem) { res.json({ available: false, reason: problem }); return; }
  const { rowCount } = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
  res.json(rowCount ? { available: false, reason: "This username is already taken." } : { available: true });
});

router.post("/auth/register", registerLimit, async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Check your name, username and password (at least 8 characters)." }); return; }
  const username = normalize(parsed.data.username);
  const problem = usernameProblem(username);
  if (problem) { res.status(400).json({ error: problem }); return; }
  const firstName = cleanName(parsed.data.firstName), lastName = cleanName(parsed.data.lastName);
  if (!firstName || !lastName) { res.status(400).json({ error: "Enter your first and last name." }); return; }
  const meta = JSON.stringify(parsed.data.meta ?? {});
  if (meta.length > 4000) { res.status(400).json({ error: "Profile details are too long." }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO users(username,first_name,last_name,password_hash,meta) VALUES($1,$2,$3,$4,$5) RETURNING ${meSql}`,
      [username, firstName, lastName, await hashPassword(parsed.data.password), meta]);
    res.status(201).json({ token: await createSession(rows[0].id), user: rows[0] });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") { res.status(409).json({ error: "This username is already taken." }); return; }
    throw err;
  }
});

router.post("/auth/login", loginLimit, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter your username and password." }); return; }
  const { rows } = await pool.query(`SELECT ${meSql}, password_hash, banned FROM users WHERE username=$1`, [normalize(parsed.data.username)]);
  const row = rows[0];
  if (!row) { await burnPasswordCheck(parsed.data.password); res.status(401).json({ error: "Wrong username or password." }); return; }
  if (!(await verifyPassword(parsed.data.password, row.password_hash))) { res.status(401).json({ error: "Wrong username or password." }); return; }
  if (row.banned) { res.status(403).json({ error: "This account is blocked. Contact the administrator." }); return; }
  const { password_hash: _h, banned: _b, ...user } = row;
  res.json({ token: await createSession(user.id), user });
});

router.post("/auth/logout", async (req, res) => {
  await endSession(bearer(req));
  res.status(204).end();
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query(`SELECT ${meSql} FROM users WHERE id=$1`, [req.user!.id]);
  res.json(rows[0]);
});

/** Profile extras edited on the device (work role, location, phone; and the display name). */
router.patch("/auth/me", requireAuth, async (req, res) => {
  const meta = req.body?.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta) || JSON.stringify(meta).length > 4000) {
    res.status(400).json({ error: "Profile details are too long." }); return;
  }
  const { rows } = await pool.query(`UPDATE users SET meta=$2 WHERE id=$1 RETURNING ${meSql}`, [req.user!.id, JSON.stringify(meta)]);
  res.json(rows[0]);
});

router.post("/auth/password", requireAuth, loginLimit, async (req, res) => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "New password needs at least 8 characters." }); return; }
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.user!.id]);
  if (!(await verifyPassword(parsed.data.currentPassword, rows[0].password_hash))) { res.status(401).json({ error: "Current password is wrong." }); return; }
  await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [await hashPassword(parsed.data.newPassword), req.user!.id]);
  // Keep only the session that made the change.
  const current = bearer(req);
  await pool.query("DELETE FROM sessions WHERE user_id=$1 AND token_hash<>encode(sha256(convert_to($2,'UTF8')),'hex')", [req.user!.id, current]);
  disconnect(req.user!.id);
  res.status(204).end();
});

export default router;
