import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { pool } from "@workspace/db";
import { UploadMediaBody } from "@workspace/api-zod";
import { requireAuth, userForToken, bearer } from "../lib/auth";
import { isUuid } from "../lib/sql";

/** Images in the database: listing photos are public, licence and registration scans are private. */
const router = Router();
const IMAGE_MIME = /^image\/(jpeg|png|webp|heic|heif)$/;
const MAX_IMAGE = 4 * 1024 * 1024;

router.post("/media", requireAuth, rateLimit({
  windowMs: 60 * 60_000, limit: 120, keyGenerator: (req) => req.user!.id,
  message: { error: "Too many uploads. Try again later." },
}), async (req, res) => {
  const parsed = UploadMediaBody.safeParse(req.body);
  if (!parsed.success || !IMAGE_MIME.test(parsed.data.mime)) { res.status(400).json({ error: "Upload a JPEG, PNG or WebP photo." }); return; }
  const data = Buffer.from(parsed.data.data, "base64");
  if (!data.length || data.length > MAX_IMAGE) { res.status(400).json({ error: "Photos must be smaller than 4 MB." }); return; }
  const { rows } = await pool.query("INSERT INTO media(owner_id,mime,data,private) VALUES($1,$2,$3,$4) RETURNING id",
    [req.user!.id, parsed.data.mime, data, parsed.data.private ?? true]);
  res.status(201).json({ id: rows[0].id });
});

router.get("/media/:id", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).end(); return; }
  const { rows } = await pool.query("SELECT owner_id, mime, data, private FROM media WHERE id=$1", [req.params.id]);
  const m = rows[0];
  if (!m) { res.status(404).end(); return; }
  if (m.private) {
    const user = await userForToken(bearer(req)).catch(() => null);
    if (!user || (user.id !== m.owner_id && user.role !== "admin")) { res.status(404).end(); return; }
  }
  res.setHeader("Content-Type", m.mime);
  res.setHeader("Cache-Control", m.private ? "private, max-age=3600" : "public, max-age=31536000, immutable");
  res.end(m.data);
});

/** True when every id is an image this user uploaded. */
export async function ownsMedia(userId: string, ids: (string | undefined | null)[]): Promise<boolean> {
  const list = ids.filter((x): x is string => !!x);
  if (list.some((x) => !isUuid(x))) return false;
  if (!list.length) return true;
  const { rows } = await pool.query("SELECT count(*)::int AS n FROM media WHERE id = ANY($1::uuid[]) AND owner_id=$2", [list, userId]);
  return rows[0].n === new Set(list).size;
}

export default router;
