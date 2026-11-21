import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { pool } from "@workspace/db";
import { CreateListingBody } from "@workspace/api-zod";
import { EQUIPMENT_TYPES, chk, nameProblem, searchCatalog, type Check } from "@workspace/reference";
import { bearer, requireAuth, userForToken, type AuthUser } from "../lib/auth";
import { notifyAdmins } from "../lib/notify";
import { isUuid } from "../lib/sql";
import { ownsMedia } from "./media";
import { vehicleCols } from "./verification";

/**
 * Rental listings live on the server. A new listing is "pending" until an admin approves it;
 * until then only its owner (and admins) can see it.
 */
const router = Router();

export const listingSql = `SELECT l.id, json_build_object('id',u.id,'firstName',u.first_name,'lastName',u.last_name,'username',u.username) AS owner,
  l.title, l.category, l.type_id AS "typeId",
  (SELECT row_to_json(x) FROM (SELECT ${vehicleCols("v")} FROM vehicles v WHERE v.id=l.vehicle_id) x) AS vehicle,
  l.price_per_day::float AS "pricePerDay", l.village, l.lat, l.lng, l.description, l.photo_id AS "photoId", l.terms, l.year,
  l.power_hp AS "powerHp", to_char(l.available_from,'YYYY-MM-DD') AS "availableFrom", to_char(l.available_to,'YYYY-MM-DD') AS "availableTo",
  l.status, l.review_note AS "reviewNote", l.checks, l.created_at AS "createdAt", l.owner_id AS "ownerId"
  FROM listings l JOIN users u ON u.id=l.owner_id`;

type Row = { ownerId: string; vehicle: { vin: string; docIds: string[]; status: string } | null; checks: Check[] | null; [k: string]: unknown };

/** The machine check is saved when the listing is created; show it as the machine stands now. */
const VEHICLE_CHECK: Record<string, Check> = {
  approved: { field: "vehicle", level: "ok", message: "Machine is verified (VIN, plate and documents)." },
  pending: { field: "vehicle", level: "warn", message: "Machine verification is still pending." },
  rejected: { field: "vehicle", level: "error", message: "The admin rejected this machine's documents." },
};
const liveChecks = (r: Row) => (r.checks ?? []).map((k) => (k.field === "vehicle" && r.vehicle ? VEHICLE_CHECK[r.vehicle.status] ?? k : k));
/** Strangers see the machine's plate and verification, but not its full VIN or document ids. */
export function shapeListing(r: Row, viewer: AuthUser | null) {
  const { ownerId, ...rest } = r;
  const mine = viewer?.id === ownerId;
  const vehicle = r.vehicle && !mine && viewer?.role !== "admin"
    ? { ...r.vehicle, vin: `•••••${r.vehicle.vin.slice(-4)}`, docIds: [] }
    : r.vehicle;
  return { ...rest, checks: liveChecks(r), vehicle, mine };
}

router.get("/listings", async (req, res) => {
  const viewer = await userForToken(bearer(req)).catch(() => null);
  const { rows } = await pool.query(`${listingSql} WHERE (l.status='approved' AND NOT u.banned) OR l.owner_id=$1 ORDER BY l.created_at DESC LIMIT 500`,
    [viewer?.id ?? null]);
  res.json(rows.map((r) => shapeListing(r, viewer)));
});

router.post("/listings", requireAuth, rateLimit({
  windowMs: 60 * 60_000, limit: 20, keyGenerator: (req) => req.user!.id,
  message: { error: "You have posted many listings. Try again later." },
}), async (req, res) => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Check the title, category, price and village." }); return; }
  const b = parsed.data;
  const me = req.user!.id;
  const checks: Check[] = [];
  const type = b.typeId ? EQUIPMENT_TYPES.find((t) => t.id === b.typeId) : undefined;
  if (b.typeId && !type) { res.status(400).json({ error: "Choose the machine type from the list." }); return; }
  if (type && type.category !== b.category) { res.status(400).json({ error: "The machine type does not match the category." }); return; }

  // Registered machines (self-propelled or with a plate) must be listed with their verified record.
  const needsVehicle = !!type && (type.plate || type.selfPropelled);
  let vehicle: { status: string; year: number | null; power_hp: number | null; type_id: string; photo_id: string | null } | undefined;
  if (b.vehicleId) {
    if (!isUuid(b.vehicleId)) { res.status(400).json({ error: "Machine not found." }); return; }
    vehicle = (await pool.query("SELECT status, year, power_hp, type_id, photo_id FROM vehicles WHERE id=$1 AND owner_id=$2", [b.vehicleId, me])).rows[0];
    if (!vehicle) { res.status(400).json({ error: "Machine not found." }); return; }
    if (vehicle.status === "rejected") { res.status(400).json({ error: "This machine was rejected by the admin. Register it again with correct documents." }); return; }
    checks.push(vehicle.status === "approved"
      ? { field: "vehicle", level: "ok", message: "Machine is verified (VIN, plate and documents)." }
      : { field: "vehicle", level: "warn", message: "Machine verification is still pending." });
    if (b.year && vehicle.year && b.year !== vehicle.year) checks.push(chk("year", "warn", "Listing says {a}, the registered machine {b}.", { a: b.year, b: vehicle.year }));
  } else if (needsVehicle) {
    res.status(400).json({ error: "Add this machine with its VIN, plate and registration document first, then choose it here." }); return;
  }
  if (!(await ownsMedia(me, [b.photoId]))) { res.status(400).json({ error: "Upload the photo again." }); return; }

  const titleProblem = nameProblem(b.title.replace(/\d+/g, ""), { allowDigits: true });
  if (titleProblem) checks.push({ field: "title", level: "warn", message: titleProblem });
  if (b.pricePerDay < 5) checks.push({ field: "price", level: "warn", message: "Unusually low price per day." });
  if (b.pricePerDay > 3000) checks.push({ field: "price", level: "warn", message: "Unusually high price per day." });
  if (b.availableFrom && b.availableTo && b.availableTo < b.availableFrom) { res.status(400).json({ error: "The last available day is before the first." }); return; }

  // Real place: match the village against the OpenStreetMap list of Azerbaijani settlements.
  const place = searchCatalog(b.village, { kind: "place", limit: 1 })[0];
  const point = place && place.score >= 0.9 ? place.item.point : undefined;
  checks.push(point
    ? chk("village", "ok", "Place found on the map: {name} ({sub}).", { name: place.item.az, sub: place.item.sub ?? "" })
    : chk("village", "warn", "\"{name}\" was not found among the settlements of Azerbaijan.", { name: b.village }));

  const day = (d?: Date) => (d ? d.toISOString().slice(0, 10) : null);
  const { rows } = await pool.query(
    `INSERT INTO listings(owner_id,vehicle_id,title,category,type_id,price_per_day,village,lat,lng,description,photo_id,terms,year,power_hp,available_from,available_to,checks)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [me, b.vehicleId ?? null, b.title.trim(), b.category, b.typeId ?? null, b.pricePerDay, place && point ? place.item.az : b.village.trim(),
      point?.[1] ?? null, point?.[0] ?? null, (b.description ?? "").trim(), b.photoId ?? vehicle?.photo_id ?? null, b.terms ? JSON.stringify(b.terms) : null,
      b.year ?? vehicle?.year ?? null, b.powerHp ?? vehicle?.power_hp ?? null, day(b.availableFrom), day(b.availableTo), JSON.stringify(checks)]);
  void notifyAdmins({ type: "review:new", kind: "listing", id: rows[0].id });
  const full = (await pool.query(`${listingSql} WHERE l.id=$1`, [rows[0].id])).rows[0];
  res.status(201).json(shapeListing(full, req.user!));
});

router.delete("/listings/:id", requireAuth, async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).end(); return; }
  if (req.user!.role === "admin") await pool.query("DELETE FROM listings WHERE id=$1", [req.params.id]);
  else await pool.query("DELETE FROM listings WHERE id=$1 AND owner_id=$2", [req.params.id, req.user!.id]);
  res.status(204).end();
});

export default router;
