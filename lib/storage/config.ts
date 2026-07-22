import "server-only";
import { z } from "zod";

const driveConfigSchema = z.object({
  authMode: z.enum(["oauth_user", "shared_drive", "delegated"]).default("oauth_user"),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  refreshToken: z.string().optional(),
  clientEmail: z.string().optional(),
  privateKey: z.string().optional(),
  sharedDriveId: z.string().optional(),
  contentFolderId: z.string().min(1, { message: "GOOGLE_DRIVE_CONTENT_FOLDER_ID is required" }),
  delegatedUser: z.string().email().optional(),
  requestTimeoutMs: z.number().int().positive().default(15000),
  maxAttempts: z.number().int().positive().default(3),
}).refine((data) => {
  if (data.authMode === "oauth_user") {
    return Boolean(data.clientId && data.clientSecret && data.refreshToken);
  }
  if (data.authMode === "shared_drive") {
    return Boolean(data.clientEmail && data.privateKey && data.sharedDriveId);
  }
  if (data.authMode === "delegated") {
    return Boolean(data.clientEmail && data.privateKey && data.delegatedUser);
  }
  return true;
}, (data) => {
  if (data.authMode === "oauth_user") {
    return { message: "clientId, clientSecret, and refreshToken are required for oauth_user authMode", path: ["authMode"] };
  }
  if (data.authMode === "shared_drive") {
    return { message: "clientEmail, privateKey, and sharedDriveId are required for shared_drive authMode", path: ["authMode"] };
  }
  return { message: "clientEmail, privateKey, and delegatedUser are required for delegated authMode", path: ["authMode"] };
});

export type DriveConfig = z.infer<typeof driveConfigSchema>;

export function getDriveConfig(): DriveConfig {
  const env = process.env;

  const rawConfig = {
    authMode: env.GOOGLE_DRIVE_AUTH_MODE || "oauth_user",
    clientId: env.GOOGLE_DRIVE_CLIENT_ID || undefined,
    clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET || undefined,
    refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN || undefined,
    clientEmail: env.GOOGLE_DRIVE_CLIENT_EMAIL || undefined,
    privateKey: env.GOOGLE_DRIVE_PRIVATE_KEY ? env.GOOGLE_DRIVE_PRIVATE_KEY.replace(/\\n/g, "\n") : undefined,
    sharedDriveId: env.GOOGLE_DRIVE_SHARED_DRIVE_ID || undefined,
    contentFolderId: env.GOOGLE_DRIVE_CONTENT_FOLDER_ID || "",
    delegatedUser: env.GOOGLE_DRIVE_DELEGATED_USER || undefined,
    requestTimeoutMs: env.GOOGLE_DRIVE_REQUEST_TIMEOUT_MS ? parseInt(env.GOOGLE_DRIVE_REQUEST_TIMEOUT_MS, 10) : 15000,
    maxAttempts: env.GOOGLE_DRIVE_MAX_ATTEMPTS ? parseInt(env.GOOGLE_DRIVE_MAX_ATTEMPTS, 10) : 3,
  };

  try {
    return driveConfigSchema.parse(rawConfig);
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw new Error(`Drive configuration validation failed: ${e.message}`);
    }
    throw e;
  }
}
