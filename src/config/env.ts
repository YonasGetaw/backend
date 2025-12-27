import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(30),
  REFRESH_COOKIE_NAME: z.string().default("vestoria_rt"),

  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce.number().default(30),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_NAME: z.string().default("Vestoria"),
  SMTP_FROM_EMAIL: z.string().default("no-reply@vestoria.local")
});

export const env = schema.parse(process.env);
