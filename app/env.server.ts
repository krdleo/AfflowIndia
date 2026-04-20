import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SHOPIFY_API_KEY: z.string().min(1, "SHOPIFY_API_KEY is required"),
  SHOPIFY_API_SECRET: z.string().min(1, "SHOPIFY_API_SECRET is required"),
  SHOPIFY_APP_URL: z.string().url("SHOPIFY_APP_URL must be a valid URL").min(1),
  SCOPES: z.string().min(1, "SCOPES is required"),
  ENCRYPTION_KEY: z.string().min(64, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),
  JWT_SECRET: z.string().min(64, "JWT_SECRET must be at least a 64-character hex string"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required").optional().or(z.literal("")),
  EMAIL_FROM: z.string().email("EMAIL_FROM must be a valid email address").default("noreply@afflow.in"),
  RAZORPAY_KEY_ID: z.string().optional().or(z.literal("")),
  RAZORPAY_KEY_SECRET: z.string().optional().or(z.literal("")),
  SHOP_CUSTOM_DOMAIN: z.string().optional().or(z.literal("")),
});

type EnvVars = z.infer<typeof envSchema>;

let env: EnvVars;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Invalid environment variables:");
    for (const issue of error.errors) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
  }
  process.exit(1);
}

export { env };
