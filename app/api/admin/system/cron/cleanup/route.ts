import { NextRequest, NextResponse } from "next/server";
import { UploadCleanupService } from "@/lib/services/admin/uploadCleanupService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error("CRON_SECRET environment variable is missing.");
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn("Unauthorized cleanup cron attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Usually cron requests won't have an admin session. We use a static system ID.
    const systemAdminUid = "system_cron";

    const storageProvider = new GoogleDriveProvider();
    const cleanupService = new UploadCleanupService(storageProvider);

    await cleanupService.processCleanupRequiredTransactions(systemAdminUid);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Cron Cleanup Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
