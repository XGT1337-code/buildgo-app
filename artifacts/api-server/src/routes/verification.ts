import { Router } from "express";
import { pool } from "@workspace/db";
import { RegisterVehicleBody, SubmitLicenseBody } from "@workspace/api-zod";
import {
  EQUIPMENT_TYPES, checkLicense, checkPlate, checkVin, chk, cleanLicense, cleanPlate, cleanVin, formatPlate, searchCatalog, type Check,
} from "@workspace/reference";
import { requireAuth } from "../lib/auth";
import { notifyAdmins } from "../lib/notify";
import { isUuid } from "../lib/sql";
import { ownsMedia } from "./media";

/** Machines (VIN, plate, registration document) and driving licences, both verified by an admin. */
const router = Router();
router.use(["/vehicles", "/license"], requireAuth);

export const vehicleCols = (v: string) => `${v}.id, ${v}.type_id AS "typeId", ${v}.brand, ${v}.model, ${v}.year, ${v}.power_hp AS "powerHp",
  ${v}.vin, ${v}.plate, ${v}.photo_id AS "photoId", ${v}.doc_ids AS "docIds", ${v}.status, ${v}.review_note AS "reviewNote",
  ${v}.checks, ${v}.created_at AS "createdAt"`;
export const licenseCols = (l: string) => `${l}.id, ${l}.number, ${l}.categories, to_char(${l}.expires_on,'YYYY-MM-DD') AS "expiresOn",
  ${l}.front_id AS "frontId", ${l}.back_id AS "backId", ${l}.status, ${l}.review_note AS "reviewNote", ${l}.checks, ${l}.created_at AS "createdAt"`;

/** Automatic part of the machine check; the admin sees these next to the documents. */
function vehicleChecks(input: { typeId: string; brand: string; model: string; vin: string; plate?: string; year?: number; powerHp?: number }) {
  const checks: Check[] = [];
  const type = EQUIPMENT_TYPES.find((t) => t.id === input.typeId);
  if (!type) return { ok: false, checks: [{ field: "type", level: "error", message: "Choose the machine type from the list." } as Check] };
  const vin = checkVin(input.vin);
  checks.push(...vin.checks);
  if (vin.year && input.year && Math.abs(vin.year - input.year) > 1) {
    checks.push(chk("year", "warn", "The VIN says model year {vin}, but {year} was entered.", { vin: vin.year, year: input.year }));
  }
  if (vin.maker && !vin.maker.toLowerCase().includes(input.brand.toLowerCase().split(/\s+/)[0])) {
    checks.push(chk("brand", "warn", "The VIN belongs to {maker}, not {brand}.", { maker: vin.maker, brand: input.brand }));
  }
  if (type.plate) checks.push(...checkPlate(input.plate ?? "").checks);
  else if (input.plate) checks.push(...checkPlate(input.plate).checks.map((c) => (c.level === "error" ? { ...c, level: "warn" as const } : c)));
  const brand = searchCatalog(input.brand, { kind: "brand", limit: 1 })[0];
  checks.push(brand && brand.score >= 0.9
    ? chk("brand", "ok", "Known brand: {name}.", { name: brand.item.az })
    : chk("brand", "warn", "Brand \"{name}\" is not in the catalog.", { name: input.brand }));
  const model = searchCatalog(input.model, { kind: "model", brand: brand?.item.az, limit: 1 })[0];
  checks.push(model && model.score >= 0.85
    ? chk("model", "ok", "Known model: {name}.", { name: model.item.az })
    : chk("model", "warn", "Model \"{name}\" is not in the catalog for this brand.", { name: input.model }));
  const year = new Date().getFullYear();
  if (input.year && input.year > year + 1) checks.push({ field: "year", level: "error", message: "The year is in the future." });
  if (input.powerHp && input.powerHp > (type.category === "tools" ? 150 : 1200)) checks.push({ field: "power", level: "warn", message: "Unusually high power for this kind of machine." });
  return { ok: !checks.some((c) => c.level === "error"), checks };
}

router.get("/vehicles/mine", async (req, res) => {
  const { rows } = await pool.query(`SELECT ${vehicleCols("v")} FROM vehicles v WHERE v.owner_id=$1 ORDER BY v.created_at DESC`, [req.user!.id]);
  res.json(rows);
});

router.post("/vehicles", async (req, res) => {
  const parsed = RegisterVehicleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Fill in the machine type, brand, model, VIN and add the registration document photo." }); return; }
  const b = parsed.data;
  const vin = cleanVin(b.vin);
  const plate = b.plate?.trim() ? formatPlate(cleanPlate(b.plate)) : null;
  const { ok, checks } = vehicleChecks({ ...b, vin, plate: plate ?? undefined });
  if (!ok) { res.status(400).json({ error: checks.find((c) => c.level === "error")!.message, checks }); return; }
  if (!(await ownsMedia(req.user!.id, [b.photoId, ...b.docIds]))) { res.status(400).json({ error: "Upload the photos again." }); return; }
  try {
    const { rows } = await pool.query(
      `INSERT INTO vehicles(owner_id,type_id,brand,model,year,power_hp,vin,plate,photo_id,doc_ids,checks)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${vehicleCols("vehicles")}`,
      [req.user!.id, b.typeId, b.brand.trim(), b.model.trim(), b.year ?? null, b.powerHp ?? null, vin, plate, b.photoId ?? null, b.docIds, JSON.stringify(checks)]);
    void notifyAdmins({ type: "review:new", kind: "vehicle", id: rows[0].id });
    res.status(201).json(rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      res.status(409).json({ error: "A machine with this VIN or plate is already registered. If it is yours, contact the administrator." }); return;
    }
    throw err;
  }
});

router.delete("/vehicles/:id", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).end(); return; }
  await pool.query("DELETE FROM vehicles WHERE id=$1 AND owner_id=$2", [req.params.id, req.user!.id]);
  res.status(204).end();
});

/** Categories of the newest approved licence that has not expired. */
export async function approvedCategories(userId: string): Promise<string[]> {
  const { rows } = await pool.query(
    "SELECT categories FROM licenses WHERE user_id=$1 AND status='approved' AND expires_on >= current_date ORDER BY created_at DESC LIMIT 1", [userId]);
  return rows[0]?.categories ?? [];
}

router.get("/license/mine", async (req, res) => {
  const { rows } = await pool.query(`SELECT ${licenseCols("l")} FROM licenses l WHERE l.user_id=$1 ORDER BY l.created_at DESC LIMIT 1`, [req.user!.id]);
  res.json({ license: rows[0] ?? null, approvedCategories: await approvedCategories(req.user!.id) });
});

router.post("/license", async (req, res) => {
  const parsed = SubmitLicenseBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Fill in the licence number, categories, expiry date and add a photo." }); return; }
  const b = parsed.data;
  const expires = b.expiresOn.toISOString().slice(0, 10);
  const categories = [...new Set(b.categories.map((c) => c.toUpperCase()))];
  const { valid, checks } = checkLicense(b.number, categories, expires);
  if (!valid) { res.status(400).json({ error: checks.find((c) => c.level === "error")!.message, checks }); return; }
  if (!(await ownsMedia(req.user!.id, [b.frontId, b.backId]))) { res.status(400).json({ error: "Upload the photos again." }); return; }
  const number = cleanLicense(b.number);
  const dupe = await pool.query("SELECT 1 FROM licenses WHERE number=$1 AND user_id<>$2 AND status<>'rejected'", [number, req.user!.id]);
  if (dupe.rowCount) {
    checks.push({ field: "number", level: "warn", message: "Another account already submitted this licence number." });
  }
  const { rows } = await pool.query(
    `INSERT INTO licenses(user_id,number,categories,expires_on,front_id,back_id,checks) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${licenseCols("licenses")}`,
    [req.user!.id, number, categories, expires, b.frontId, b.backId ?? null, JSON.stringify(checks)]);
  void notifyAdmins({ type: "review:new", kind: "license", id: rows[0].id });
  res.status(201).json(rows[0]);
});

export default router;
