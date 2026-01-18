import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { connectToDatabase } from "../db.js";
import { Job } from "../models/Job.js";
import { requireAdmin, type AdminRequest } from "../middleware/requireAdmin.js";

const router = Router();

type JobType = "job" | "result" | "admit-card";

function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/latest", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit || "20");
  const type = (String(req.query.type || "job") as JobType) || "job";

  await connectToDatabase();

  const items = await Job.find({ type, isExpired: false })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 50))
    .lean();

  return res.json({ items });
});

router.get("/counts/state", async (req: Request, res: Response) => {
  const type = (String(req.query.type || "job") as JobType) || "job";
  await connectToDatabase();

  const rows = await Job.aggregate([
    { $match: { type, isExpired: false } },
    { $group: { _id: "$state", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return res.json({
    rows: rows.map((r: any) => ({ state: String(r._id ?? ""), count: Number(r.count ?? 0) })),
  });
});

router.get("/counts/qualification", async (req: Request, res: Response) => {
  const type = (String(req.query.type || "job") as JobType) || "job";
  await connectToDatabase();

  const rows = await Job.aggregate([
    { $match: { type, isExpired: false } },
    { $group: { _id: "$qualification", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return res.json({
    rows: rows.map((r: any) => ({ qualification: String(r._id ?? ""), count: Number(r.count ?? 0) })),
  });
});

router.get("/counts/department", async (req: Request, res: Response) => {
  const type = (String(req.query.type || "job") as JobType) || "job";
  await connectToDatabase();

  const rows = await Job.aggregate([
    { $match: { type, isExpired: false } },
    { $group: { _id: "$department", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);

  return res.json({
    rows: rows.map((r: any) => ({ department: String(r._id ?? ""), count: Number(r.count ?? 0) })),
  });
});

router.get("/slug/:slug", async (req: Request, res: Response) => {
  await connectToDatabase();
  const doc = await Job.findOne({ slug: req.params.slug }).lean();
  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json({ item: doc });
});

router.get("/", async (req: Request, res: Response) => {
  const type = (String(req.query.type || "job") as JobType) || "job";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;
  const state = typeof req.query.state === "string" ? req.query.state.trim() : undefined;
  const qualification = typeof req.query.qualification === "string" ? req.query.qualification.trim() : undefined;
  const department = typeof req.query.department === "string" ? req.query.department.trim() : undefined;
  const includeExpired = String(req.query.includeExpired || "") === "1";

  const page = Number(req.query.page || "1");
  const limit = Number(req.query.limit || "20");

  await connectToDatabase();

  const pageSafe = Number.isFinite(page) ? Math.max(page, 1) : 1;
  const limitSafe = Math.min(Math.max(Number.isFinite(limit) ? limit : 20, 1), 50);
  const skip = (pageSafe - 1) * limitSafe;

  const filter: any = { type };
  if (!includeExpired) filter.isExpired = false;
  if (state) filter.state = state;
  if (qualification) filter.qualification = qualification;
  if (department) filter.department = department;

  if (q) {
    const safe = escapeRegex(q);
    filter.$or = [
      { title: { $regex: safe, $options: "i" } },
      { department: { $regex: safe, $options: "i" } },
      { state: { $regex: safe, $options: "i" } },
      { qualification: { $regex: safe, $options: "i" } },
    ];
  }

  const [items, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitSafe).lean(),
    Job.countDocuments(filter),
  ]);

  return res.json({
    items,
    total,
    page: pageSafe,
    limit: limitSafe,
    totalPages: Math.max(Math.ceil(total / limitSafe), 1),
  });
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

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function toDate(input?: string) {
  if (!input) return undefined;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

async function ensureUniqueSlug(base: string) {
  const normalized = slugify(base);
  if (!normalized) return `job-${Date.now()}`;

  let slug = normalized;
  let i = 2;
  while (await Job.exists({ slug })) {
    slug = `${normalized}-${i}`;
    i += 1;
  }
  return slug;
}

router.post("/", requireAdmin, async (req: AdminRequest, res) => {
  const parsed = jobInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  await connectToDatabase();

  const slug = await ensureUniqueSlug(parsed.data.title);

  try {
    const doc = await Job.create({
      ...parsed.data,
      slug,
      startDate: toDate(parsed.data.startDate),
      lastDate: toDate(parsed.data.lastDate),
      isExpired: false,
    });

    return res.json({ ok: true, id: String(doc._id), slug: String(doc.slug) });
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: "Duplicate job (source URL already exists)" });
    }
    return res.status(500).json({ error: "Failed to create job" });
  }
});

router.delete("/:id", requireAdmin, async (req: AdminRequest, res) => {
  await connectToDatabase();
  const doc = await Job.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

export default router;
