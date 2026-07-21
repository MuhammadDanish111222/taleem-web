import "server-only";
import { z } from "zod";

const driveConfigSchema = z.object({
  authMode: z.enum(["shared_drive", "delegated"]),
  clientEmail: z.string().email(),
  privateKey: z.string().min(1),
  sharedDriveId: z.string().min(1),
  contentFolderId: z.string().min(1),
  delegatedUser: z.string().email().optional(),
  requestTimeoutMs: z.number().int().positive().default(15000),
  maxAttempts: z.number().int().positive().default(3),
}).refine((data) => {
  if (data.authMode === "delegated" && !data.delegatedUser) {
    return false;
  }
  return true;
}, {
  message: "delegatedUser is required when authMode is delegated",
  path: ["delegatedUser"],
});

export type DriveConfig = z.infer<typeof driveConfigSchema>;

export function getDriveConfig(): DriveConfig {
  const env = process.env;
  
  const rawConfig = {
    authMode: env.GOOGLE_DRIVE_AUTH_MODE || "shared_drive",
    clientEmail: env.GOOGLE_DRIVE_CLIENT_EMAIL || "",
    privateKey: (env.GOOGLE_DRIVE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    sharedDriveId: env.GOOGLE_DRIVE_SHARED_DRIVE_ID || "",
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
