import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdminSession } from "@/lib/auth/session";
import { DomainError } from "@/lib/services/admin/catalogueService";
import { parseMultipartRequest } from "@/lib/security/multipartUpload";
import { validatePdf } from "@/lib/security/pdfValidation";
import { UploadService } from "@/lib/services/admin/uploadService";
import { GoogleDriveProvider } from "@/lib/storage/googleDriveProvider";
import { UploadError } from "@/lib/uploads/errors";
import { getUploadConfig } from "@/lib/uploads/config";
import { v4 as uuidv4 } from "uuid";

function mapErrorToResponse(error: unknown) {
  if (error instanceof UploadError) {
    switch (error.code) {
      case "VALIDATION_ERROR": return NextResponse.json({ error: error.message }, { status: 422 });
      case "PAYLOAD_TOO_LARGE": return NextResponse.json({ error: error.message }, { status: 413 });
      case "IDEMPOTENCY_IN_PROGRESS": return NextResponse.json({ error: error.message }, { status: 409 });
      case "IDEMPOTENCY_CONFLICT": return NextResponse.json({ error: error.message }, { status: 409 });
      case "DUPLICATE_CONTENT": return NextResponse.json({ error: error.message }, { status: 409 });
      case "DUPLICATE_RESOURCE_VERSION": return NextResponse.json({ error: error.message }, { status: 409 });
      case "UNAUTHORIZED": return NextResponse.json({ error: error.message }, { status: 401 });
      case "FORBIDDEN": return NextResponse.json({ error: error.message }, { status: 403 });
      case "CLEANUP_REQUIRED": return NextResponse.json({ error: error.message }, { status: 409 });
      case "INTERNAL_ERROR": return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (error instanceof DomainError) {
    switch (error.code) {
      case "FORBIDDEN": return NextResponse.json({ error: error.message }, { status: 403 });
      case "VALIDATION": return NextResponse.json({ error: error.message }, { status: 422 });
    }
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }
    if (error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed" }, { status: 422 });
    }
  }

  console.error("Upload API Error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

async function validateOriginAndCSRF(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (origin && host) {
    const originUrl = new URL(origin);
    if (originUrl.host !== host) {
      throw new DomainError("FORBIDDEN", "Invalid origin");
    }
  }

  const csrfHeader = request.headers.get("X-CSRF-Token");
  if (!csrfHeader) {
    throw new DomainError("FORBIDDEN", "Missing CSRF token");
  }

  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get("__csrf")?.value;

  if (!csrfCookie || csrfCookie !== csrfHeader) {
    throw new DomainError("FORBIDDEN", "CSRF token mismatch");
  }
}

export async function POST(request: NextRequest) {
  const requestId = uuidv4();
  
  try {
    // 1. Generate or obtain request ID (done)
    // 2. Validate Origin
    // 3. Validate CSRF token
    await validateOriginAndCSRF(request);

    // 4. Validate admin session cookie
    // 5. Confirm admin authorization
    const session = await requireAdminSession();
    
    // 6. Validate HTTP method and content type
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      throw new UploadError("VALIDATION_ERROR", "Content-Type must be multipart/form-data");
    }
    
    // 7. Validate idempotency header format
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (!idempotencyKey || idempotencyKey.trim().length === 0 || idempotencyKey.length > 100) {
      throw new UploadError("VALIDATION_ERROR", "Invalid or missing Idempotency-Key header");
    }

    // 8. Content-Length precheck
    const config = getUploadConfig();
    const contentLengthStr = request.headers.get("content-length");
    if (contentLengthStr) {
      const contentLength = parseInt(contentLengthStr, 10);
      if (contentLength > config.maxMultipartBytes) {
        throw new UploadError("PAYLOAD_TOO_LARGE", "Content-Length exceeds maximum allowed payload size");
      }
    }

    // 9. Begin reading or parsing the request body (Streamed)
    const parseResult = await parseMultipartRequest(request, request.headers);

    let result;
    try {
      // 10. PDF Validation
      const validatedPdf = await validatePdf(parseResult.file);

      // 11. Upload Service execution
      const uploadService = new UploadService(new GoogleDriveProvider());
      result = await uploadService.processUpload(
        session.uid,
        requestId,
        idempotencyKey,
        parseResult.fields,
        validatedPdf,
        parseResult.file.tempFile
      );
    } finally {
      // Always cleanup temp file
      if (parseResult.file && parseResult.file.tempFile) {
        await parseResult.file.tempFile.cleanup();
      }
    }

    const status = result.replayed ? 200 : 201;
    return NextResponse.json({ ...result, requestId }, { status });

  } catch (error) {
    const res = mapErrorToResponse(error);
    // Ensure request ID is returned in error response
    try {
      const data = await res.clone().json();
      return NextResponse.json({ ...data, requestId }, { status: res.status });
    } catch {
      return res;
    }
  }
}
