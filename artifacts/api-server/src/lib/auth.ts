import { createHash, randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { pool } from "@workspace/db";

export type Role = "user" | "admin";
export interface AuthUser { id: string; username: string; role: Role }

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

const SESSION_DAYS = 60;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Issues an opaque bearer token. Only its hash is stored, so the sessions table cannot be replayed. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now() + $3::interval)",
    [sha256(token), userId, `${SESSION_DAYS} days`]);
  return token;
}

export async function endSession(token: string): Promise<void> {
  await pool.query("DELETE FROM sessions WHERE token_hash=$1", [sha256(token)]);
}

export async function userForToken(token: string): Promise<AuthUser | null> {
  if (!token || token.length > 100) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.role FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT u.banned`, [sha256(token)]);
  return rows[0] ?? null;
}

export const bearer = (req: Request) => /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? "";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await userForToken(bearer(req));
    if (!user) { res.status(401).json({ error: "Sign in to continue." }); return; }
    req.user = user;
    next();
  } catch (err) { next(err); }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") { res.status(403).json({ error: "Admins only." }); return; }
  next();
}

export const meSql = `id, username, first_name AS "firstName", last_name AS "lastName", role, meta, created_at AS "createdAt"`;
