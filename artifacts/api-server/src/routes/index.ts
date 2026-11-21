import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import chatRouter from "./chat";
import adminRouter from "./admin";
import mediaRouter from "./media";
import verificationRouter from "./verification";
import listingsRouter from "./listings";
import catalogRouter from "./catalog";
import weatherRouter from "./weather";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(chatRouter);
router.use(adminRouter);
router.use(mediaRouter);
router.use(verificationRouter);
router.use(listingsRouter);
router.use(catalogRouter);
router.use(weatherRouter);

router.use((err: unknown, req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction) => {
  req.log.error({ err }, "API request failed");
  if ((err as { type?: string }).type === "entity.too.large") { res.status(413).json({ error: "This file is too large." }); return; }
  res.status(500).json({ error: "Something went wrong on the server. Please try again." });
});

export default router;
