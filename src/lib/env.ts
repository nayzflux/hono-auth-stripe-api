import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Server
    PORT: z.string().transform((s) => parseInt(s)),
    // Cors
    ORIGIN_URL: z.string(),
    // Database
    DATABASE_URL: z.string(),
    // Session
    SESSION_SECRET: z.string(),
    // Stripe
    STRIPE_API_KEY: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),
    // Github OAuth
    GITHUB_CLIENT_ID: z.string(),
    GITHUB_CLIENT_SECRET: z.string(),
    GITHUB_CALLBACK_URL: z.string(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
