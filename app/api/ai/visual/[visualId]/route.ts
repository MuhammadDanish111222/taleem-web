import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { z } from "zod";
import {
  authenticateAskRequest,
} from "@/lib/ai/bff";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

const visualIdSchema = z.string().trim().min(1).max(160);
const requestIdSchema = z.string().uuid();
const referenceSchema = z
  .object({
    storage_provider: z.literal("google_drive"),
    storage_key: z.string().trim().min(1).max(1000),
  })
  .strict();

const visualHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ visualId: string }> },
) {
  const identity = await authenticateAskRequest(request);
  if (!identity.ok) return identity.response;

  const { visualId: rawVisualId } = await params;
  const visualId = visualIdSchema.safeParse(rawVisualId);
  const requestId = requestIdSchema.safeParse(
    request.nextUrl.searchParams.get("requestId"),
  );
  if (!visualId.success || !requestId.success) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: visualHeaders,
    });
  }

  try {
    const rawReference = await callAiService(
      `/api/v1/internal/ask/visual/${encodeURIComponent(visualId.data)}`,
      "GET",
      null,
      identity.uid,
      false,
      "ask_visual",
      {
        requestId: requestId.data,
        accountTier: identity.accountTier,
      },
    );
    const reference = referenceSchema.parse(rawReference);
    const image = await new GoogleDriveProvider().readImage(
      reference.storage_key,
      { signal: request.signal, requestId: requestId.data },
    );
    return new NextResponse(
      Readable.toWeb(image.stream as Readable) as ReadableStream,
      {
        status: 200,
        headers: {
          ...visualHeaders,
          "Content-Type": image.mimeType,
          ...(image.contentLength > 0
            ? { "Content-Length": image.contentLength.toString() }
            : {}),
        },
      },
    );
  } catch {
    return new NextResponse("Not Found", {
      status: 404,
      headers: visualHeaders,
    });
  }
}
