import { Router, type Request, type Response } from "express";
import { env } from "../env.js";

const router = Router();

function isAuthorized(req: { headers: { authorization?: string; [k: string]: any }; query: any }) {
  const ua = String(req.headers["user-agent"] || "");

  if (ua.includes("vercel-cron/1.0")) return true;
  if (!env.CRON_SCRAPE_TOKEN) return false;

  const header = String(req.headers.authorization || "");
  if (header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length) === env.CRON_SCRAPE_TOKEN;
  }

  const token = typeof req.query?.token === "string" ? req.query.token : "";
  if (token && token === env.CRON_SCRAPE_TOKEN) return true;

  return false;
}

router.get("/daily", async (req: Request, res: Response) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Placeholder for now: move scraping/automation logic into backend later.
  return res.json({ ok: true, inserted: 0, duplicates: 0, expiredMarked: 0, totalScraped: 0 });
});

export default router;
