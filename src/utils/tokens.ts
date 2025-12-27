import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export type JwtUser = {
  sub: string;
  role: "USER" | "ADMIN";
};

export function signAccessToken(payload: JwtUser): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_EXPIRES_IN } as jwt.SignOptions);
}

export function signRefreshToken(payload: JwtUser): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET);
}

export function verifyAccessToken(token: string): JwtUser {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtUser;
}

export function verifyRefreshToken(token: string): JwtUser {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtUser;
}
