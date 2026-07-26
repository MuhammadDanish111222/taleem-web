import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { callAiService } from "@/lib/internalApi/callAiService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

export async function GET(request: NextRequest, { params }: { params: Promise<{ visualId: string }> }) {
  // Gate is deliberately before any auth/session/query/service work.
  if (!isAdminPanelEnabled()) return new NextResponse("Not Found", { status: 404 });
  try {
    const session = await requireAdminSession();
    if (session.admin !== true) return NextResponse.json({ status: "error", message: "Unauthorized" }, { status: 403 });
    const { visualId } = await params;
    const query = request.nextUrl.searchParams;
    const board_id = query.get("board_id") || "";
    const class_id = query.get("class_id") || "";
    const subject_id = query.get("subject_id") || "";
    const corpus_version_id = query.get("corpus_version_id") || "";
    if (![board_id, class_id, subject_id, corpus_version_id, visualId].every((value) => value.trim())) {
      return NextResponse.json({ status: "error", message: "Invalid visual request" }, { status: 400 });
    }
    const reference = await callAiService("/api/v1/internal/admin/rag", "POST", {
      operation: "visual_stream_ref", board_id, class_id, subject_id, corpus_version_id, visual_id: visualId,
    }, session.uid, true, "local_rag_visual_stream", { requestId: request.headers.get("x-request-id") ?? undefined });
    const image = await new GoogleDriveProvider().readImage(reference.storage_key);
    return new NextResponse(Readable.toWeb(image.stream as Readable) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        "Content-Length": image.contentLength.toString(),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'",
      },
    });
  } catch {
    // Do not disclose provider details, Drive IDs/keys, or internal-service errors.
    return NextResponse.json({ status: "error", message: "Visual unavailable" }, { status: 404 });
  }
}
