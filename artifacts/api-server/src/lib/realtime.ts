import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { pool } from "@workspace/db";
import { userForToken } from "./auth";
import { logger } from "./logger";

/**
 * Live updates over one WebSocket per device at /api/ws. The client authenticates with its first
 * frame ({type:"auth", token}) so the token never appears in a URL or access log.
 *
 * Server → client: message, conversation, request, request:gone, read, typing, presence.
 * Client → server: auth, typing {conversationId, peerId}, ping.
 */
const sockets = new Map<string, Set<WebSocket>>();

export const isOnline = (userId: string) => (sockets.get(userId)?.size ?? 0) > 0;
export const onlineCount = () => sockets.size;

export function publish(userIds: string | string[], event: Record<string, unknown>) {
  const frame = JSON.stringify(event);
  for (const id of Array.isArray(userIds) ? userIds : [userIds]) {
    for (const ws of sockets.get(id) ?? []) if (ws.readyState === ws.OPEN) ws.send(frame);
  }
}

/** Ends every live socket of a user (ban, delete). */
export function disconnect(userId: string) {
  for (const ws of sockets.get(userId) ?? []) ws.close(4001, "signed out");
}

/** People who share a conversation with this user — they see the online dot change. */
async function contactsOf(userId: string): Promise<string[]> {
  const { rows } = await pool.query(
    "SELECT CASE WHEN user_a=$1 THEN user_b ELSE user_a END AS id FROM chat_conversations WHERE user_a=$1 OR user_b=$1", [userId]);
  return rows.map((r) => r.id as string);
}

async function announce(userId: string, online: boolean) {
  const at = new Date().toISOString();
  if (!online) await pool.query("UPDATE users SET last_seen_at=now() WHERE id=$1", [userId]).catch(() => {});
  publish(await contactsOf(userId).catch(() => []), { type: "presence", userId, online, at });
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: "/api/ws", maxPayload: 16 * 1024 });

  wss.on("connection", (ws) => {
    let userId: string | null = null;
    let alive = true;
    const authTimer = setTimeout(() => { if (!userId) ws.close(4000, "auth timeout"); }, 10_000);

    ws.on("pong", () => { alive = true; });
    const beat = setInterval(() => {
      if (!alive) { ws.terminate(); return; }
      alive = false; ws.ping();
    }, 25_000);

    ws.on("message", async (raw) => {
      let msg: { type?: string; token?: string; conversationId?: string; peerId?: string };
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (msg.type === "auth" && !userId) {
        const user = await userForToken(String(msg.token ?? "")).catch(() => null);
        if (!user) { ws.close(4001, "bad token"); return; }
        clearTimeout(authTimer);
        userId = user.id;
        const set = sockets.get(userId) ?? new Set();
        const first = set.size === 0;
        set.add(ws); sockets.set(userId, set);
        ws.send(JSON.stringify({ type: "ready", userId }));
        if (first) void announce(userId, true);
        return;
      }
      if (!userId) return;
      if (msg.type === "typing" && msg.conversationId && msg.peerId) {
        // Only relay to the other member of a conversation this user is actually in.
        const ok = await pool.query("SELECT 1 FROM chat_conversations WHERE id=$1 AND ((user_a=$2 AND user_b=$3) OR (user_a=$3 AND user_b=$2))",
          [msg.conversationId, userId, msg.peerId]).catch(() => null);
        if (ok?.rowCount) publish(msg.peerId, { type: "typing", conversationId: msg.conversationId, userId });
      } else if (msg.type === "ping") {
        ws.send('{"type":"pong"}');
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer); clearInterval(beat);
      if (!userId) return;
      const set = sockets.get(userId);
      set?.delete(ws);
      if (set && set.size === 0) { sockets.delete(userId); void announce(userId, false); }
    });
    ws.on("error", (err) => logger.warn({ err }, "websocket error"));
  });
  return wss;
}
