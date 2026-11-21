import { Router } from "express";
import { GetWeatherQueryParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";

/**
 * Forecast cross-check: Open-Meteo (blend of national weather models) against MET Norway
 * (the Norwegian Meteorological Institute's ECMWF-based forecast). Two independent services
 * agreeing is a good sign the numbers match what forecasters say; disagreement is shown to users.
 * Both are free; MET Norway requires an identifying User-Agent, so it is called from the server.
 */
const router = Router();
const UA = "BuildGO/1.0 (construction equipment rental; contact: admin@buildgo.local)";
const TTL = 30 * 60_000;
const cache = new Map<string, { at: number; body: unknown }>();

type Day = { hi: number; lo: number; rain: number; wind: number | null; code: number | null };
const r1 = (n: number) => Math.round(n * 10) / 10;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function openMeteo(lat: number, lng: number) {
  const j = await getJson("https://api.open-meteo.com/v1/forecast"
    + `?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&current=temperature_2m`
    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=7");
  const days = new Map<string, Day>();
  (j.daily.time as string[]).forEach((date, i) => days.set(date, {
    hi: r1(j.daily.temperature_2m_max[i]), lo: r1(j.daily.temperature_2m_min[i]), rain: r1(j.daily.precipitation_sum[i] ?? 0),
    wind: Math.round(j.daily.wind_speed_10m_max[i] ?? 0), code: j.daily.weather_code[i] ?? null,
  }));
  return { days, offset: j.utc_offset_seconds as number, now: j.current?.temperature_2m as number | undefined };
}

/** MET Norway gives hourly (then 6-hourly) steps in UTC; fold them into local calendar days. */
const metNoJson = (lat: number, lng: number) =>
  getJson(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function metNo(j: any, offsetSec: number) {
  const days = new Map<string, { hi: number; lo: number; rain: number; wind: number }>();
  const series = j.properties.timeseries as { time: string; data: { instant: { details: { air_temperature: number; wind_speed: number } };
    next_1_hours?: { details: { precipitation_amount: number } }; next_6_hours?: { details: { precipitation_amount: number; air_temperature_max?: number; air_temperature_min?: number } } } }[];
  let lastHourly = -Infinity;
  for (const s of series) {
    const t = new Date(s.time).getTime();
    const date = new Date(t + offsetSec * 1000).toISOString().slice(0, 10);
    const d = days.get(date) ?? { hi: -Infinity, lo: Infinity, rain: 0, wind: 0 };
    const temp = s.data.instant.details.air_temperature;
    d.hi = Math.max(d.hi, temp); d.lo = Math.min(d.lo, temp);
    d.wind = Math.max(d.wind, s.data.instant.details.wind_speed * 3.6);
    if (s.data.next_1_hours) { d.rain += s.data.next_1_hours.details.precipitation_amount; lastHourly = t; }
    else if (s.data.next_6_hours && t >= lastHourly + 3600_000) d.rain += s.data.next_6_hours.details.precipitation_amount;
    days.set(date, d);
  }
  return { days, now: series[0]?.data.instant.details.air_temperature };
}

router.get("/weather", async (req, res) => {
  const parsed = GetWeatherQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Give lat and lng." }); return; }
  const lat = Math.round(parsed.data.lat * 100) / 100, lng = Math.round(parsed.data.lng * 100) / 100;
  const key = `${lat},${lng}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) { res.json(hit.body); return; }
  try {
    // Both services are asked at once; MET Norway's steps are folded into days once the local offset is known.
    const metRaw = metNoJson(lat, lng).catch((err) => { logger.warn({ err }, "MET Norway unavailable"); return null; });
    // One retry: a single slow response should not cost the user their forecast.
    const om = await openMeteo(lat, lng).catch(() => openMeteo(lat, lng));
    const metJson = await metRaw;
    let met: ReturnType<typeof metNo> | null = null;
    try { if (metJson) met = metNo(metJson, om.offset); } catch (err) { logger.warn({ err }, "MET Norway answer not understood"); }
    const today = new Date(Date.now() + om.offset * 1000).toISOString().slice(0, 10);
    const days = [...om.days.entries()].map(([date, a]) => {
      const m = met?.days.get(date);
      // MET Norway's "today" starts now, so its max/min miss the morning: compare current temperatures instead.
      if (date === today && om.now != null && met?.now != null) {
        const b = m && Number.isFinite(m.hi) ? { hi: r1(Math.max(m.hi, met.now)), lo: r1(m.lo), rain: r1(m.rain), wind: Math.round(m.wind), code: null } : null;
        return { date, openMeteo: a, metNo: b, agree: Math.abs(om.now - met.now) <= 3 };
      }
      // The last MET day is often only partly covered; skip comparing a day with few samples.
      const b = m && Number.isFinite(m.hi) && m.hi !== m.lo ? { hi: r1(m.hi), lo: r1(m.lo), rain: r1(m.rain), wind: Math.round(m.wind), code: null } : null;
      const agree = !b || (Math.abs(a.hi - b.hi) <= 3 && Math.abs(a.lo - b.lo) <= 3 && Math.abs(a.rain - b.rain) <= Math.max(3, 0.5 * Math.max(a.rain, b.rain)));
      return { date, openMeteo: a, metNo: b, agree };
    });
    const body = {
      days, now: { openMeteo: om.now ?? null, metNo: met?.now ?? null, at: new Date().toISOString() },
      sources: ["Open-Meteo", ...(met ? ["MET Norway"] : [])], fetchedAt: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), body });
    res.json(body);
  } catch (err) {
    logger.warn({ err }, "weather fetch failed");
    if (hit) { res.json(hit.body); return; }
    res.status(502).json({ error: "Weather services are not reachable right now." });
  }
});

export default router;
