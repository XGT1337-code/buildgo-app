import { pool } from "@workspace/db";
import { isOnline } from "./realtime";

/** Timestamps inside json_build_object use the same ISO-8601 "Z" form as top-level Date columns. */
export const iso = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const publicUserJson = (u: string) =>
  `json_build_object('id',${u}.id,'username',${u}.username,'firstName',${u}.first_name,'lastName',${u}.last_name,'lastSeenAt',${iso(`${u}.last_seen_at`)})`;

export const messageCols = (m: string) =>
  `${m}.id, ${m}.conversation_id AS "conversationId", ${m}.sender_id AS "senderId", ${m}.client_id AS "clientId",
   ${m}.kind, ${m}.text, ${m}.audio_id AS "audioId", ${m}.duration_ms AS "durationMs", ${iso(`${m}.at`)} AS at`;

type WithId = { id: string };
/** Adds the live online flag, which only this process knows. */
export const withOnline = <T extends WithId>(u: T) => ({ ...u, online: isOnline(u.id) });

/** Conversations as seen by $1 (peer, last message, unread count, how far the peer has read). */
const conversationSql = `SELECT c.id, ${iso("c.updated_at")} AS "updatedAt",
  ${iso("CASE WHEN c.user_a=$1 THEN c.b_read_at ELSE c.a_read_at END")} AS "peerReadAt",
  ${publicUserJson("p")} AS peer,
  (SELECT row_to_json(x) FROM (SELECT ${messageCols("m")} FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY m.at DESC LIMIT 1) x) AS last,
  (SELECT count(*)::int FROM chat_messages m WHERE m.conversation_id=c.id AND m.sender_id<>$1
     AND m.at > CASE WHEN c.user_a=$1 THEN c.a_read_at ELSE c.b_read_at END) AS unread
  FROM chat_conversations c JOIN users p ON p.id = CASE WHEN c.user_a=$1 THEN c.user_b ELSE c.user_a END`;

type ConversationRow = { id: string; peer: WithId; [k: string]: unknown };
const shape = (r: ConversationRow) => ({ ...r, peer: withOnline(r.peer) });

export async function conversationsFor(userId: string) {
  const { rows } = await pool.query(`${conversationSql} WHERE c.user_a=$1 OR c.user_b=$1 ORDER BY c.updated_at DESC`, [userId]);
  return rows.map(shape);
}

export async function conversationFor(userId: string, conversationId: string) {
  const { rows } = await pool.query(`${conversationSql} WHERE c.id=$2 AND (c.user_a=$1 OR c.user_b=$1)`, [userId, conversationId]);
  return rows[0] ? shape(rows[0]) : null;
}

/** Pending requests with both people expanded. */
export const requestSql = `SELECT r.id, r.status, ${iso("r.created_at")} AS "createdAt", ${publicUserJson("f")} AS "from", ${publicUserJson("t")} AS "to"
  FROM chat_requests r JOIN users f ON f.id=r.from_id JOIN users t ON t.id=r.to_id`;
export const shapeRequest = (r: { from: WithId; to: WithId; [k: string]: unknown }) => ({ ...r, from: withOnline(r.from), to: withOnline(r.to) });

export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
