import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { z } from "zod";
import { authenticateAskRequest } from "@/lib/ai/bff";
import { isMultipleAskRun1Enabled } from "@/lib/config/multipleAsk";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

const id = z.string().uuid();
const visualId = z.string().trim().min(1).max(160);
const reference = z.object({ storage_provider: z.literal("google_drive"), storage_key: z.string().trim().min(1).max(1000) }).strict();
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'" } as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string; visualId: string }> }) {
  if (!isMultipleAskRun1Enabled()) return new NextResponse("Not Found", { status: 404, headers });
  const identity = await authenticateAskRequest(request);
  if (!identity.ok) return identity.response;
  const values = await params;
  const jobId = id.safeParse(values.jobId); const parsedVisualId = visualId.safeParse(values.visualId);
  if (!jobId.success || !parsedVisualId.success) return new NextResponse("Not Found", { status: 404, headers });
  try {
    const raw = await callAiService(`/api/v1/internal/multiple-ask/jobs/${encodeURIComponent(jobId.data)}/visual/${encodeURIComponent(parsedVisualId.data)}`, "GET", null, identity.uid, false, "multiple_ask", { accountTier: identity.accountTier });
    const streamReference = reference.parse(raw);
    const image = await new GoogleDriveProvider().readImage(streamReference.storage_key, { signal: request.signal, requestId: jobId.data });
    return new NextResponse(Readable.toWeb(image.stream as Readable) as ReadableStream, { status: 200, headers: { ...headers, "Content-Type": image.mimeType, ...(image.contentLength > 0 ? { "Content-Length": image.contentLength.toString() } : {}) } });
  } catch { return new NextResponse("Not Found", { status: 404, headers }); }
}
