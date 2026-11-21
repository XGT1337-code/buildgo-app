import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import { pool } from "@workspace/db";
import { GetChatMessagesQueryParams, SearchPeopleQueryParams, SendChatMessageBody, SendChatRequestBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { publish } from "../lib/realtime";
import {
  conversationFor, conversationsFor, isUuid, messageCols, publicUserJson, requestSql, shapeRequest, withOnline,
} from "../lib/sql";

const router = Router();
router.use(["/people", "/chat"], requireAuth);
router.use(["/people", "/chat"], rateLimit({
  windowMs: 60_000, limit: 300, keyGenerator: (req) => req.user!.id,
  standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Try again in a minute." },
}));

const me = (req: Request) => req.user!.id;

// ---------------------------------------------------------------------------- people search

router.get("/people/search", async (req, res) => {
  const parsed = SearchPeopleQueryParams.safeParse(req.query);
  if (!parsed.success) { res.json([]); return; }
  // Every word must appear in "first last username"; exact name matches rank first.
  const words = parsed.data.q.trim().toLowerCase().replace(/^@/, "").split(/\s+/).filter(Boolean).slice(0, 4);
  const likes = words.map((w) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const where = likes.map((_, i) => `lower(u.first_name || ' ' || u.last_name || ' ' || u.username) LIKE $${i + 3}`).join(" AND ");
  const { rows } = await pool.query(
    `SELECT ${publicUserJson("u")} AS u,
       c.id AS "conversationId",
       CASE WHEN c.id IS NOT NULL THEN 'connected' WHEN mine.id IS NOT NULL THEN 'requested' WHEN theirs.id IS NOT NULL THEN 'incoming' ELSE 'none' END AS relation,
       COALESCE(mine.id, theirs.id) AS "requestId"
     FROM users u
     LEFT JOIN chat_conversations c ON (c.user_a=$1 AND c.user_b=u.id) OR (c.user_b=$1 AND c.user_a=u.id)
     LEFT JOIN chat_requests mine ON mine.from_id=$1 AND mine.to_id=u.id AND mine.status='pending'
     LEFT JOIN chat_requests theirs ON theirs.from_id=u.id AND theirs.to_id=$1 AND theirs.status='pending'
     WHERE u.id<>$1 AND NOT u.banned AND ${where}
     ORDER BY (lower(u.first_name || ' ' || u.last_name) = $2) DESC, u.first_name, u.last_name LIMIT 30`,
    [me(req), words.join(" "), ...likes]);
  res.json(rows.map(({ u, ...r }) => ({ ...withOnline(u), ...r })));
});

// ---------------------------------------------------------------------------- chat requests

router.get("/chat/requests", async (req, res) => {
  const { rows } = await pool.query(`${requestSql} WHERE r.status='pending' AND (r.from_id=$1 OR r.to_id=$1) ORDER BY r.created_at DESC`, [me(req)]);
  const all = rows.map(shapeRequest);
  res.json({ incoming: all.filter((r) => r.to.id === me(req)), outgoing: all.filter((r) => r.from.id === me(req)) });
});

/** Creates (or finds) the conversation for two people and tells both devices about it. */
async function openConversation(x: string, y: string) {
  const [a, b] = [x, y].sort();
  const { rows } = await pool.query(
    "INSERT INTO chat_conversations(user_a,user_b) VALUES($1,$2) ON CONFLICT(user_a,user_b) DO UPDATE SET user_a=excluded.user_a RETURNING id", [a, b]);
  await pool.query("UPDATE chat_requests SET status='accepted' WHERE status='pending' AND ((from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1))", [x, y]);
  const id = rows[0].id as string;
  const [forX, forY] = await Promise.all([conversationFor(x, id), conversationFor(y, id)]);
  publish(x, { type: "conversation", conversation: forX });
  publish(y, { type: "conversation", conversation: forY });
  publish([x, y], { type: "request:gone", between: [x, y] });
  return forX;
}

router.post("/chat/requests", rateLimit({
  windowMs: 60 * 60_000, limit: 40, keyGenerator: (req) => req.user!.id,
  message: { error: "You have sent many requests. Try again later." },
}), async (req, res) => {
  const parsed = SendChatRequestBody.safeParse(req.body);
  const target = parsed.success ? parsed.data.userId : "";
  if (!isUuid(target) || target === me(req)) { res.status(400).json({ error: "Choose another person." }); return; }
  const user = await pool.query("SELECT 1 FROM users WHERE id=$1 AND NOT banned", [target]);
  if (!user.rowCount) { res.status(404).json({ error: "User not found." }); return; }
  const [a, b] = [me(req), target].sort();
  const existing = await pool.query("SELECT id FROM chat_conversations WHERE user_a=$1 AND user_b=$2", [a, b]);
  if (existing.rowCount) { res.json({ conversation: await conversationFor(me(req), existing.rows[0].id) }); return; }
  // They already asked me: asking back means yes.
  const theirs = await pool.query("SELECT id FROM chat_requests WHERE from_id=$1 AND to_id=$2 AND status='pending'", [target, me(req)]);
  if (theirs.rowCount) { res.json({ conversation: await openConversation(me(req), target) }); return; }
  const prev = await pool.query("SELECT status, created_at > now() - interval '1 day' AS recent FROM chat_requests WHERE from_id=$1 AND to_id=$2", [me(req), target]);
  if (prev.rows[0]?.status === "declined" && prev.rows[0].recent) {
    res.status(429).json({ error: "This person declined recently. You can ask again tomorrow." }); return;
  }
  const { rows } = await pool.query(
    `INSERT INTO chat_requests(from_id,to_id) VALUES($1,$2)
     ON CONFLICT(from_id,to_id) DO UPDATE SET status='pending', created_at=CASE WHEN chat_requests.status='pending' THEN chat_requests.created_at ELSE now() END
     RETURNING id`, [me(req), target]);
  const request = shapeRequest((await pool.query(`${requestSql} WHERE r.id=$1`, [rows[0].id])).rows[0]);
  publish(target, { type: "request", request });
  res.json({ request });
});

router.post("/chat/requests/:id/accept", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).json({ error: "Request not found." }); return; }
  const { rows } = await pool.query("SELECT from_id FROM chat_requests WHERE id=$1 AND to_id=$2 AND status='pending'", [req.params.id, me(req)]);
  if (!rows[0]) { res.status(404).json({ error: "This request is no longer waiting." }); return; }
  res.json(await openConversation(me(req), rows[0].from_id));
});

router.post("/chat/requests/:id/decline", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).json({ error: "Request not found." }); return; }
  const { rows } = await pool.query("UPDATE chat_requests SET status='declined' WHERE id=$1 AND to_id=$2 AND status='pending' RETURNING from_id", [req.params.id, me(req)]);
  if (rows[0]) publish([rows[0].from_id, me(req)], { type: "request:gone", id: req.params.id });
  res.status(204).end();
});

router.delete("/chat/requests/:id", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).json({ error: "Request not found." }); return; }
  const { rows } = await pool.query("DELETE FROM chat_requests WHERE id=$1 AND from_id=$2 AND status='pending' RETURNING to_id", [req.params.id, me(req)]);
  if (rows[0]) publish([rows[0].to_id, me(req)], { type: "request:gone", id: req.params.id });
  res.status(204).end();
});

// ---------------------------------------------------------------------------- conversations

router.get("/chat/conversations", async (req, res) => {
  res.json(await conversationsFor(me(req)));
});

/** Membership check for every /chat/conversations/:id/* route; leaves the peer id on res.locals. */
router.use("/chat/conversations/:id", async (req, res, next) => {
  if (!isUuid(req.params.id)) { res.status(404).json({ error: "Conversation not found." }); return; }
  const { rows } = await pool.query(
    "SELECT CASE WHEN user_a=$2 THEN user_b ELSE user_a END AS peer, user_a=$2 AS is_a FROM chat_conversations WHERE id=$1 AND (user_a=$2 OR user_b=$2)",
    [req.params.id, me(req)]);
  if (!rows[0]) { res.status(404).json({ error: "Conversation not found." }); return; }
  res.locals.peer = rows[0].peer; res.locals.isA = rows[0].is_a;
  next();
});

router.get("/chat/conversations/:id/messages", async (req, res) => {
  const parsed = GetChatMessagesQueryParams.safeParse(req.query);
  const before = parsed.success && parsed.data.before ? parsed.data.before : null;
  const { rows } = await pool.query(`SELECT ${messageCols("m")} FROM chat_messages m
    WHERE m.conversation_id=$1 AND ($2::timestamptz IS NULL OR m.at<$2) ORDER BY m.at DESC LIMIT 60`, [req.params.id, before]);
  res.json(rows.reverse());
});

const AUDIO_MIME = /^audio\/(webm|ogg|mp4|m4a|x-m4a|aac|mpeg|3gpp|wav|x-wav)(;.*)?$/;
const MAX_AUDIO = 6 * 1024 * 1024;

router.post("/chat/conversations/:id/messages", rateLimit({
  windowMs: 60_000, limit: 90, keyGenerator: (req) => req.user!.id,
  message: { error: "Please wait before sending more messages." },
}), async (req, res) => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Message must contain 1–4000 characters." }); return; }
  const { clientId, voice } = parsed.data;
  const text = (parsed.data.text ?? "").trim();
  let audio: Buffer | null = null;
  if (voice) {
    if (!AUDIO_MIME.test(voice.mime)) { res.status(400).json({ error: "Unsupported audio format." }); return; }
    audio = Buffer.from(voice.data, "base64");
    if (!audio.length || audio.length > MAX_AUDIO) { res.status(400).json({ error: "Voice message is too long." }); return; }
  } else if (!text) { res.status(400).json({ error: "Message must contain 1–4000 characters." }); return; }

  const sender = me(req);
  const client = await pool.connect();
  let message;
  try {
    await client.query("BEGIN");
    const dupe = await client.query(`SELECT ${messageCols("m")} FROM chat_messages m WHERE m.sender_id=$1 AND m.client_id=$2`, [sender, clientId]);
    if (dupe.rows[0]) {
      // A retry of something already saved: return it unchanged instead of a second copy.
      await client.query("ROLLBACK");
      if (dupe.rows[0].conversationId !== req.params.id) { res.status(409).json({ error: "Message retry does not match the original." }); return; }
      res.status(201).json(dupe.rows[0]); return;
    }
    const audioId = audio
      ? (await client.query("INSERT INTO chat_audio(data,mime) VALUES($1,$2) RETURNING id", [audio, voice!.mime])).rows[0].id
      : null;
    const { rows } = await client.query(
      `INSERT INTO chat_messages(conversation_id,sender_id,client_id,kind,text,audio_id,duration_ms,at)
       VALUES($1,$2,$3,$4,$5,$6,$7,date_trunc('milliseconds', clock_timestamp())) RETURNING ${messageCols("chat_messages")}`,
      [req.params.id, sender, clientId, audio ? "voice" : "text", audio ? "" : text, audioId, audio ? voice!.durationMs : null]);
    message = rows[0];
    await client.query(`UPDATE chat_conversations SET updated_at=$2, ${res.locals.isA ? "a_read_at" : "b_read_at"}=$2 WHERE id=$1`, [req.params.id, message.at]);
    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
  publish([sender, res.locals.peer], { type: "message", message });
  res.status(201).json(message);
});

router.post("/chat/conversations/:id/read", async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE chat_conversations SET ${res.locals.isA ? "a_read_at" : "b_read_at"}=now() WHERE id=$1 RETURNING to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at`,
    [req.params.id]);
  publish([res.locals.peer, me(req)], { type: "read", conversationId: req.params.id, userId: me(req), at: rows[0].at });
  res.status(204).end();
});

router.get("/chat/audio/:id", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).end(); return; }
  const { rows } = await pool.query(
    `SELECT a.data, a.mime FROM chat_audio a JOIN chat_messages m ON m.audio_id=a.id
     JOIN chat_conversations c ON c.id=m.conversation_id WHERE a.id=$1 AND (c.user_a=$2 OR c.user_b=$2)`, [req.params.id, me(req)]);
  if (!rows[0]) { res.status(404).end(); return; }
  res.setHeader("Content-Type", rows[0].mime);
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.end(rows[0].data);
});

export default router;
