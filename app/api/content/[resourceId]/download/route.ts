import { NextRequest, NextResponse } from "next/server";
import { getResource, getResourceVersion } from "@/lib/repositories/firestore/resourceRepository";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";
import { ResourceError } from "@/lib/resources/errors";
import { Readable } from "stream";

export const dynamic = "force-dynamic";

function sanitizeFilename(name: string): string {
  return name.replace(/[\/\x00-\x1F\x7F\x22\x27\x5C]/g, "_").trim() || "document.pdf";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params;

  let resource;
  try {
    resource = await getResource(resourceId);
  } catch (err) {
    if (err instanceof ResourceError && err.code === "NOT_FOUND") {
      return new NextResponse("Not Found", { status: 404 });
    }
    throw err;
  }

  if (resource.status !== "published") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const version = await getResourceVersion(resourceId, resource.currentVersionId);
  const driveProvider = new GoogleDriveProvider();

  const readResult = await driveProvider.readRange(version.storageKey);
  const webStream = Readable.toWeb(readResult.stream as Readable);

  const safeName = sanitizeFilename(version.originalFilename);
  const contentDisposition = `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;

  return new NextResponse(webStream as any, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition,
      "Content-Length": version.sizeBytes.toString(),
      "Cache-Control": "private, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
