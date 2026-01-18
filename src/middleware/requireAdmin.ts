import { NextFunction, Request, Response } from "express";
import { getTokenFromRequest, verifyAuthToken } from "../auth.js";

export type AdminRequest = Request & {
  auth?: {
    sub: string;
    name?: string;
    email: string;
    role: "admin";
  };
};

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    const payload = verifyAuthToken(token);
    if (payload.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    req.auth = payload as any;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}
