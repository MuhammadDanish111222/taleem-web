import { NextRequest, NextResponse } from "next/server";
import { getPublishedResourceAccess } from "@/lib/resources/public";
import { getSharedGoogleDriveProvider } from "@/lib/storage/googleDriveProvider";
import { ResourceError } from "@/lib/resources/errors";
import { parseByteRange, sanitizePdfFilename } from "@/lib/http/pdfResponse";
import { Readable } from "stream";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params;

  let resource;
  try {
    resource = await getPublishedResourceAccess(resourceId);
  } catch (err) {
    if (err instanceof ResourceError && err.code === "NOT_FOUND") {
      return new NextResponse("Not Found", { status: 404 });
    }
    throw err;
  }

  const etag = `"${resource.sha256}"`;

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
  const parsedRange = parseByteRange(rangeHeader, resource.sizeBytes);

  if (parsedRange.unsatisfiable) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...commonHeaders,
        "Content-Range": `bytes */${resource.sizeBytes}`,
      },
    });
  }

  const driveProvider = getSharedGoogleDriveProvider();
  const safeName = sanitizePdfFilename(resource.originalFilename);
  const contentDisposition = `inline; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;

  if (parsedRange.valid && parsedRange.start !== undefined && parsedRange.end !== undefined) {
    const readResult = await driveProvider.readRange(resource.storageKey, {
      start: parsedRange.start,
      end: parsedRange.end,
    }, { trustedSizeBytes: resource.sizeBytes });

    const webStream = Readable.toWeb(readResult.stream as Readable);
    const contentLength = parsedRange.end - parsedRange.start + 1;

    return new NextResponse(webStream as any, {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
        "Content-Length": contentLength.toString(),
        "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${resource.sizeBytes}`,
      },
    });
  }

  // Fallback / full 200 GET response
  const readResult = await driveProvider.readRange(
    resource.storageKey,
    undefined,
    { trustedSizeBytes: resource.sizeBytes },
  );
  const webStream = Readable.toWeb(readResult.stream as Readable);

  return new NextResponse(webStream as any, {
    status: 200,
    headers: {
      ...commonHeaders,
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition,
      "Content-Length": resource.sizeBytes.toString(),
    },
  });
}
