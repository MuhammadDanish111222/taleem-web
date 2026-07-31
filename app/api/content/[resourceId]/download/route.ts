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
    "Accept-Ranges": "bytes",
    ETag: etag,
  };

  if (req.headers.get("if-none-match") === etag && !req.headers.has("range")) {
    return new NextResponse(null, { status: 304, headers: commonHeaders });
  }

  const parsedRange = parseByteRange(req.headers.get("range"), resource.sizeBytes);
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
  const contentDisposition = `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;

  if (parsedRange.valid && parsedRange.start !== undefined && parsedRange.end !== undefined) {
    const readResult = await driveProvider.readRange(
      resource.storageKey,
      { start: parsedRange.start, end: parsedRange.end },
      { trustedSizeBytes: resource.sizeBytes },
    );
    const webStream = Readable.toWeb(readResult.stream as Readable);
    return new NextResponse(webStream as BodyInit, {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
        "Content-Length": String(parsedRange.end - parsedRange.start + 1),
        "Content-Range": `bytes ${parsedRange.start}-${parsedRange.end}/${resource.sizeBytes}`,
      },
    });
  }

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
