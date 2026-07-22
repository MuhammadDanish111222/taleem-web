import { NextRequest, NextResponse } from "next/server";
import { parseMultipartRequest } from "@/lib/security/multipartUpload";
import { validatePdf } from "@/lib/security/pdfValidation";
import { UploadError } from "@/lib/uploads/errors";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const parseResult = await parseMultipartRequest(request, request.headers);

    let pdfValidationResult = null;
    let pdfValidationError = null;

    try {
      pdfValidationResult = await validatePdf(parseResult.file);
    } catch (err) {
      if (err instanceof UploadError) {
        pdfValidationError = { code: err.code, message: err.message };
      } else if (err instanceof Error) {
        pdfValidationError = { code: "ERROR", message: err.message };
      }
    } finally {
      if (parseResult.file?.tempFile) {
        await parseResult.file.tempFile.cleanup();
      }
    }

    return NextResponse.json({
      success: pdfValidationError === null,
      magicBytesValid: parseResult.file.magicBytesValid,
      originalFilename: parseResult.file.originalFilename,
      sizeBytes: parseResult.file.sizeBytes,
      sha256: parseResult.file.sha256,
      pdfValidationResult,
      pdfValidationError,
    });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 422 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
