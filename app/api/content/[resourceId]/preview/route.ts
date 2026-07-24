import { NextRequest, NextResponse } from "next/server";
import { getResource, getResourceVersion } from "@/lib/repositories/firestore/resourceRepository";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";
import { ResourceError } from "@/lib/resources/errors";
import { Readable } from "stream";

function sanitizeFilename(name: string): string {
  return name.replace(/[\/\x00-\x1F\x7F\x22\x27\x5C]/g, "_").trim() || "document.pdf";
}

function parseRangeHeader(
  rangeStr: string | null,
  totalSize: number
): { valid: boolean; start?: number; end?: number; unsatisfiable?: boolean } {
  if (!rangeStr) return { valid: false };
  const match = rangeStr.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return { valid: false };

  const startStr = match[1];
  const endStr = match[2];

  if (startStr === "" && endStr === "") {
    return { valid: false };
  }

  // Suffix range: bytes=-500
  if (startStr === "" && endStr !== "") {
    const suffix = parseInt(endStr, 10);
    if (isNaN(suffix) || suffix <= 0) return { valid: false };
    const start = Math.max(0, totalSize - suffix);
    const end = totalSize - 1;
    return { valid: true, start, end };
  }

  // Range from start: bytes=500-
  if (startStr !== "" && endStr === "") {
    const start = parseInt(startStr, 10);
    if (isNaN(start) || start < 0) return { valid: false };
    if (start >= totalSize) return { valid: true, unsatisfiable: true };
    const end = totalSize - 1;
    return { valid: true, start, end };
  }

  // Explicit range: bytes=start-end
  if (startStr !== "" && endStr !== "") {
    const start = parseInt(startStr, 10);
    const endRaw = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(endRaw) || start < 0 || endRaw < start) {
      return { valid: false };
    }
    if (start >= totalSize) {
      return { valid: true, unsatisfiable: true };
    }
    const end = Math.min(endRaw, totalSize - 1);
    return { valid: true, start, end };
  }

  return { valid: false };
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
  const etag = `"${version.sha256}"`;

  const commonHeaders: Record<string, string> = {
    "Cache-Control": "private, no-cache, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'self'; object-src 'none';",
    ETag: etag,
    "Accept-Ranges": "bytes",
  };

  // ETag conditional check
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: commonHeaders,
    });
  }

  const rangeHeader = req.headers.get("range");
  const parsedRange = parseRangeHeader(rangeHeader, version.sizeBytes);

  if (parsedRange.unsatisfiable) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        "Content-Range": `bytes */${version.sizeBytes}`,
      },
    });
  }

  const driveProvider = new GoogleDriveProvider();
  const safeName = sanitizeFilename(version.originalFilename);
  const contentDisposition = `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;

  if (parsedRange.valid && parsedRange.start !== undefined && parsedRange.end !== undefined) {
    const readResult = await driveProvider.readRange(version.storageKey, {
      start: parsedRange.start,
      end: parsedRange.end,
    });

    const webStream = Readable.toWeb(readResult.stream as Readable);
    const contentLength = parsedRange.end - parsedRange.start + 1;

    return new NextResponse(webStream as any, {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
        "Content-Length": contentLength.toString(),
        "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${version.sizeBytes}`,
      },
    });
  }

  // Fallback / full 200 GET response
  const readResult = await driveProvider.readRange(version.storageKey);
  const webStream = Readable.toWeb(readResult.stream as Readable);

  return new NextResponse(webStream as any, {
    status: 200,
    headers: {
      ...commonHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition,
      "Content-Length": version.sizeBytes.toString(),
    },
  });
}
