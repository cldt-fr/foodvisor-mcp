import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  FOODVISOR_BASE_URL: z.string().url().default("https://api.foodvisor.io"),
  FOODVISOR_LOCALE_PATH: z.string().default("/api/6.0/ios/FR/fr_FR"),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
