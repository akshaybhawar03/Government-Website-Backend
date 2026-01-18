import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as cookie from "cookie";
import { env } from "./env.js";

export const AUTH_COOKIE_NAME = "gjp_auth";

export type AuthTokenPayload = {
  sub: string;
  name?: string;
  email: string;
  role: "user" | "admin";
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signAuthToken(payload: AuthTokenPayload, expiresIn: jwt.SignOptions["expiresIn"] = "7d") {
  return jwt.sign(payload, env.JWT_SECRET as jwt.Secret, { expiresIn });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}

export function createAuthCookie(token: string) {
  return cookie.serialize(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie() {
  return cookie.serialize(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export function getTokenFromRequest(req: { headers: { cookie?: string } }) {
  const cookieHeader = req.headers.cookie ?? "";
  const parsed = cookie.parse(cookieHeader);
  const token = parsed[AUTH_COOKIE_NAME];
  return token ?? null;
}
