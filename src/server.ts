import "dotenv/config";
import express, { type Request, type Response } from "express";
import { env } from "./env.js";
import authRoutes from "./routes/auth.js";
import jobsRoutes from "./routes/jobs.js";
import adminRoutes from "./routes/admin.js";
import cronRoutes from "./routes/cron.js";

const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req: Request, res: Response) => {
  return res.json({ ok: true, service: "government-website-backend" });
});

app.get("/health", (_req: Request, res: Response) => {
  return res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cron", cronRoutes);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${env.PORT}`);
});
