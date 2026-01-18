import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { connectToDatabase } from "../db.js";
import { Job } from "../models/Job.js";
import { User } from "../models/User.js";
import { hashPassword } from "../auth.js";
import { requireAdmin, type AdminRequest } from "../middleware/requireAdmin.js";

const router = Router();

router.post("/setup", async (req: Request, res: Response) => {
  const schema = z.object({
    token: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(10),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  if (!env.ADMIN_SETUP_TOKEN) {
    return res.status(400).json({ error: "ADMIN_SETUP_TOKEN is not configured" });
  }

  if (parsed.data.token !== env.ADMIN_SETUP_TOKEN) {
    return res.status(401).json({ error: "Invalid setup token" });
  }

  await connectToDatabase();

  const exists = await User.exists({ email: parsed.data.email.toLowerCase() });
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const password = await hashPassword(parsed.data.password);
  await User.create({
    name: "Admin",
    email: parsed.data.email.toLowerCase(),
    password,
    role: "admin",
  });

  return res.json({ ok: true });
});

const jobInputSchema = z.object({
  type: z.enum(["job", "result", "admit-card"]).default("job"),
  title: z.string().min(3),
  department: z.string().min(2),
  state: z.string().min(2),
  qualification: z.string().min(2),
  eligibility: z.string().optional(),
  ageLimit: z.string().optional(),
  vacancies: z.string().optional(),
  salary: z.string().optional(),
  fees: z.string().optional(),
  startDate: z.string().optional(),
  lastDate: z.string().optional(),
  selectionProcess: z.string().optional(),
  applyLink: z.string().url(),
  notificationPDF: z.string().url().optional(),
  source: z.object({
    name: z.string().min(2),
    url: z.string().url(),
  }),
});

function slugifyInput(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function toDateInput(input?: string) {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

async function ensureUniqueSlug(base: string) {
  const normalized = slugifyInput(base);
  if (!normalized) return `job-${Date.now()}`;

  let slug = normalized;
  let i = 2;
  while (await Job.exists({ slug })) {
    slug = `${normalized}-${i}`;
    i += 1;
  }
  return slug;
}

router.post("/jobs", requireAdmin, async (req: AdminRequest, res: Response) => {
  const parsed = jobInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  await connectToDatabase();

  const slug = await ensureUniqueSlug(parsed.data.title);

  try {
    const doc = await Job.create({
      ...parsed.data,
      slug,
      startDate: toDateInput(parsed.data.startDate),
      lastDate: toDateInput(parsed.data.lastDate),
      isExpired: false,
    });

    return res.json({ ok: true, id: String((doc as any)._id), slug: String((doc as any).slug) });
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: "Duplicate job (source URL already exists)" });
    }
    return res.status(500).json({ error: "Failed to create job" });
  }
});

router.get("/jobs", requireAdmin, async (_req: AdminRequest, res: Response) => {
  await connectToDatabase();
  const items = await Job.find({}).sort({ createdAt: -1 }).limit(200).lean();
  return res.json({ items });
});

router.get("/jobs/:id", requireAdmin, async (req: AdminRequest, res: Response) => {
  await connectToDatabase();
  const doc = await Job.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json({ item: doc });
});

const updateSchema = z
  .object({
    type: z.enum(["job", "result", "admit-card"]).optional(),
    title: z.string().min(3).optional(),
    department: z.string().min(2).optional(),
    state: z.string().min(2).optional(),
    qualification: z.string().min(2).optional(),
    eligibility: z.string().optional(),
    ageLimit: z.string().optional(),
    vacancies: z.string().optional(),
    salary: z.string().optional(),
    fees: z.string().optional(),
    startDate: z.string().optional(),
    lastDate: z.string().optional(),
    selectionProcess: z.string().optional(),
    applyLink: z.string().url().optional(),
    notificationPDF: z.string().url().optional(),
    source: z
      .object({
        name: z.string().min(2),
        url: z.string().url(),
      })
      .optional(),
    isExpired: z.boolean().optional(),
  })
  .strict();

function toDate(input?: string) {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

router.put("/jobs/:id", requireAdmin, async (req: AdminRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  await connectToDatabase();

  const update: any = { ...parsed.data };
  if ("startDate" in update) update.startDate = toDate(update.startDate);
  if ("lastDate" in update) update.lastDate = toDate(update.lastDate);

  try {
    const doc = await Job.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!doc) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: "Duplicate job (source URL already exists)" });
    }
    return res.status(500).json({ error: "Failed to update job" });
  }
});

router.delete("/jobs/:id", requireAdmin, async (req: AdminRequest, res: Response) => {
  await connectToDatabase();
  const doc = await Job.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

router.get("/stats", requireAdmin, async (_req: AdminRequest, res: Response) => {
  await connectToDatabase();
  const [jobs, results, admitCards] = await Promise.all([
    Job.countDocuments({ type: "job", isExpired: false }),
    Job.countDocuments({ type: "result", isExpired: false }),
    Job.countDocuments({ type: "admit-card", isExpired: false }),
  ]);

  return res.json({ jobs, results, admitCards });
});

export default router;
