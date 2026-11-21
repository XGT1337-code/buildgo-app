import { Router } from "express";
import { pool } from "@workspace/db";
import { AddCatalogItemBody, CheckCatalogNameBody, SearchCatalogQueryParams } from "@workspace/api-zod";
import { checkName, searchCatalog, type CatalogEntry, type CatalogKind } from "@workspace/reference";
import { requireAdmin, requireAuth } from "../lib/auth";
import { isUuid } from "../lib/sql";

/**
 * Reference catalog: built-in data (kinds of work, building materials, machines, brands, models, every settlement of
 * Azerbaijan from OpenStreetMap) plus what admins add. Admin additions are checked for plausibility.
 */
const router = Router();

async function customEntries(): Promise<CatalogEntry[]> {
  const { rows } = await pool.query("SELECT id, kind, name_az, name_ru, name_en, brand, lat, lng FROM catalog_items ORDER BY created_at");
  return rows.map((r) => ({
    kind: r.kind as CatalogKind, id: r.id, az: r.name_az, ru: r.name_ru || r.name_az, en: r.name_en || r.name_az,
    names: [r.name_az, r.name_ru, r.name_en, r.brand ? `${r.brand} ${r.name_az}` : ""].filter(Boolean),
    sub: r.brand ?? undefined, point: r.lat != null && r.lng != null ? [r.lng, r.lat] as [number, number] : undefined, source: "admin" as const,
  }));
}

const toItem = (e: CatalogEntry, score?: number) => ({
  id: e.id, kind: e.kind, az: e.az, ru: e.ru, en: e.en, sub: e.sub ?? null,
  lat: e.point?.[1] ?? null, lng: e.point?.[0] ?? null, source: e.source, ...(score != null ? { score: Math.round(score * 100) / 100 } : {}),
});

router.get("/catalog", async (req, res) => {
  const parsed = SearchCatalogQueryParams.safeParse(req.query);
  if (!parsed.success || !parsed.data.q.trim()) { res.json([]); return; }
  const found = searchCatalog(parsed.data.q, { kind: parsed.data.kind, brand: parsed.data.brand, extra: await customEntries(), limit: 12 });
  res.json(found.map((m) => toItem(m.item, m.score)));
});

router.get("/catalog/custom", async (_req, res) => {
  res.json((await customEntries()).map((e) => toItem(e)));
});

router.use("/admin/catalog", requireAuth, requireAdmin);

router.post("/admin/catalog/check", async (req, res) => {
  const parsed = CheckCatalogNameBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a name." }); return; }
  const r = checkName(parsed.data.kind, parsed.data.name, { brand: parsed.data.brand, extra: await customEntries() });
  res.json({ verdict: r.verdict, message: r.message, matches: r.matches.map((m) => toItem(m.entry, m.score)) });
});

router.post("/admin/catalog", async (req, res) => {
  const parsed = AddCatalogItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter a name." }); return; }
  const b = parsed.data;
  const extra = await customEntries();
  // Every given language is checked; the worst verdict wins.
  const names = [b.az, b.ru, b.en].filter((x): x is string => !!x?.trim());
  const results = names.map((n) => checkName(b.kind, n, { brand: b.brand, extra }));
  const invalid = results.find((r) => r.verdict === "invalid");
  if (invalid) { res.status(400).json({ error: invalid.message }); return; }
  const exists = results.find((r) => r.verdict === "exists");
  if (exists) { res.status(409).json({ error: exists.message }); return; }
  const similar = results.find((r) => r.verdict === "similar");
  if (similar && !b.force) { res.status(409).json({ error: similar.message, needsConfirm: true }); return; }
  if (b.kind === "place" && (b.lat == null || b.lng == null || b.lat < 38.3 || b.lat > 41.95 || b.lng < 44.7 || b.lng > 50.4)) {
    res.status(400).json({ error: "A new place needs coordinates inside Azerbaijan." }); return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO catalog_items(kind,name_az,name_ru,name_en,brand,lat,lng,verdict,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [b.kind, b.az.trim(), b.ru?.trim() ?? "", b.en?.trim() ?? "", b.brand?.trim() || null, b.lat ?? null, b.lng ?? null,
        similar ? "similar-confirmed" : "new", req.user!.id]);
    const entry = (await customEntries()).find((e) => e.id === rows[0].id)!;
    res.status(201).json(toItem(entry));
  } catch (err) {
    if ((err as { code?: string }).code === "23505") { res.status(409).json({ error: "Already in the catalog." }); return; }
    throw err;
  }
});

router.delete("/admin/catalog/:id", async (req, res) => {
  if (!isUuid(req.params.id)) { res.status(404).end(); return; }
  await pool.query("DELETE FROM catalog_items WHERE id=$1", [req.params.id]);
  res.status(204).end();
});

export default router;
