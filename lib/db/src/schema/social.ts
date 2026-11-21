import { boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

/** Accounts. Passwords are stored only as scrypt hashes (see api-server/src/lib/password.ts). */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  /** Sign-up extras copied into the on-device profile: work role, location, contact phone. */
  meta: jsonb("meta").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});
/** Opaque bearer tokens; only their SHA-256 is stored, so a database leak does not leak sessions. */
export const sessions = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [index("sessions_user").on(t.userId)]);
/** "May I message you?" — a conversation exists only after the recipient accepts. */
export const chatRequests = pgTable("chat_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  fromId: uuid("from_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  toId: uuid("to_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("chat_request_pair").on(t.fromId, t.toId)]);
export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userA: uuid("user_a").notNull().references(() => users.id, { onDelete: "cascade" }),
  userB: uuid("user_b").notNull().references(() => users.id, { onDelete: "cascade" }),
  aReadAt: timestamp("a_read_at", { withTimezone: true }).defaultNow().notNull(),
  bReadAt: timestamp("b_read_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("chat_pair_unique").on(t.userA, t.userB)]);
export const chatAudio = pgTable("chat_audio", {
  id: uuid("id").defaultRandom().primaryKey(),
  data: bytea("data").notNull(),
  mime: text("mime").notNull(),
});
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull().references(() => chatConversations.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").notNull(),
  kind: text("kind").notNull().default("text"),
  text: text("text").notNull().default(""),
  audioId: uuid("audio_id").references(() => chatAudio.id, { onDelete: "set null" }),
  durationMs: integer("duration_ms"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("chat_message_idempotency").on(t.senderId, t.clientId),
  index("chat_message_history").on(t.conversationId, t.at),
]);
export const insertUser = createInsertSchema(users);
export const insertChatMessage = createInsertSchema(chatMessages);
