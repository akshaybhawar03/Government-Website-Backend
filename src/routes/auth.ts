import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { connectToDatabase } from "../db.js";
import { User } from "../models/User.js";
import {
  clearAuthCookie,
  createAuthCookie,
  getTokenFromRequest,
  hashPassword,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from "../auth.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    await connectToDatabase();

    const exists = await User.exists({ email: parsed.data.email.toLowerCase() });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const password = await hashPassword(parsed.data.password);

    await User.create({
      name: parsed.data.name.trim(),
      email: parsed.data.email.toLowerCase(),
      password,
      role: "user",
    });

    return res.status(201).json({ ok: true });
  } catch (e: any) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: "Email already registered" });
    }
    return res.status(500).json({ error: "Registration failed" });
  }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  try {
    await connectToDatabase();

    const user: any = await User.findOne({ email: parsed.data.email.toLowerCase() });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const ok = await verifyPassword(parsed.data.password, String(user.password));
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });

    const token = signAuthToken({
      sub: String(user._id),
      name: user.name ? String(user.name) : undefined,
      email: String(user.email),
      role: user.role === "admin" ? "admin" : "user",
    });

    res.setHeader("Set-Cookie", createAuthCookie(token));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", async (_req: Request, res: Response) => {
  res.setHeader("Set-Cookie", clearAuthCookie());
  return res.json({ ok: true });
});

router.get("/me", async (req: Request, res: Response) => {
  const token = getTokenFromRequest(req);
  if (!token) return res.json({ authenticated: false });

  try {
    const payload = verifyAuthToken(token);
    return res.json({ authenticated: true, user: payload });
  } catch {
    return res.json({ authenticated: false });
  }
});

export default router;
