import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { z } from "zod";
import { getAdminAuth } from "@/lib/firebase/admin";
import { signTestGeneratorJwt } from "@/lib/internalAuth/signInternalJwt";
import { callTestPaperVisualReference } from "@/lib/tests/edgeClient";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";

const scopeId = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
const visualId = z.string().trim().min(1).max(160);
const visualQuery = z.object({
  questionId: z.string().uuid(),
  visualId,
  boardId: scopeId,
  classId: scopeId,
  subjectId: scopeId,
});
const referenceSchema = z.object({
  storage_provider: z.literal("google_drive"),
  storage_key: z.string().trim().min(1).max(1000),
}).strict();
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'",
} as const;

function unavailable(status = 404) {
  return new NextResponse("Not Found", { status, headers });
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) return unavailable(401);
  let uid: string;
  try { uid = (await getAdminAuth().verifyIdToken(authorization.slice(7))).uid; }
  catch { return unavailable(401); }

  const parsed = visualQuery.safeParse({
    questionId: request.nextUrl.searchParams.get("questionId"),
    visualId: request.nextUrl.searchParams.get("visualId"),
    boardId: request.nextUrl.searchParams.get("boardId"),
    classId: request.nextUrl.searchParams.get("classId"),
    subjectId: request.nextUrl.searchParams.get("subjectId"),
  });
  if (!parsed.success) return unavailable();

  try {
    const requestId = randomUUID();
    const token = await signTestGeneratorJwt(uid, requestId);
    const rawReference = await callTestPaperVisualReference(token, {
      operation: "visual_reference",
      question_id: parsed.data.questionId,
      visual_id: parsed.data.visualId,
      board_id: parsed.data.boardId,
      class_id: parsed.data.classId,
      subject_id: parsed.data.subjectId,
      seed: requestId,
    });
    const reference = referenceSchema.parse(rawReference);
    const image = await new GoogleDriveProvider().readImage(reference.storage_key, {
      signal: request.signal,
      requestId,
    });
    return new NextResponse(Readable.toWeb(image.stream as Readable) as ReadableStream, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": image.mimeType,
        ...(image.contentLength > 0 ? { "Content-Length": image.contentLength.toString() } : {}),
      },
    });
  } catch {
    return unavailable();
  }
}
