import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Authenticated API responses must not be reduced to empty 304 responses:
// the generated Expo fetcher has no browser cache body to restore for them.
app.set("etag", false);
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Bearer tokens, not cookies: any origin may call the API (web build, Expo dev server, the APK).
app.use(cors({ origin: true }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
// Voice messages arrive as base64 JSON (up to 6 MB of audio).
app.use(express.json({ limit: "9mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// The website: the Expo web export (pnpm --filter @workspace/agrolink run build:web), served
// from the same origin as the API so it needs no configuration.
const web = process.env.WEB_DIR ?? path.resolve(process.cwd(), "artifacts/agrolink/dist");
const webDir = existsSync(path.join(web, "index.html")) ? web : path.resolve(process.cwd(), "../agrolink/dist");
if (existsSync(path.join(webDir, "index.html"))) {
  // Expo puts fonts under assets/__node_modules/.pnpm/…, so dot-folders must be served.
  app.use(express.static(webDir, { index: false, maxAge: "1h", dotfiles: "allow" }));
  // Unknown files are 404s; only page routes fall back to the app shell.
  app.get(/^(?!\/api\/)(?!.*\.[a-z0-9]{2,5}$).*/i, (_req, res) => res.sendFile(path.join(webDir, "index.html")));
  logger.info({ webDir }, "Serving website");
}

export default app;
