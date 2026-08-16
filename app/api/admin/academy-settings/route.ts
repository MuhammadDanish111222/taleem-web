import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdminSession } from "@/lib/auth/session";
import { isAdminPanelEnabled } from "@/lib/config/adminPanel";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import {
  academySettingsMutationSchema,
  readAcademySettingsAdmin,
  writeAcademySettingsAtomically,
} from "@/lib/repositories/firestore/academySettingsRepository";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
  const status = (error as { status?: unknown })?.status;
  const message = error instanceof Error ? error.message : "Unknown error";
  if (typeof status === "number" && status >= 400 && status < 500) {
    return NextResponse.json(
      { status: "error", code: "ACADEMY_SETTINGS_REJECTED", message },
      { status }
    );
  }
  if (message === "UNAUTHENTICATED") {
    return NextResponse.json(
      { status: "error", code: "UNAUTHENTICATED", message: "Admin session required" },
      { status: 401 }
    );
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json(
      { status: "error", code: "FORBIDDEN", message: "Admin privileges required" },
      { status: 403 }
    );
  }
  return NextResponse.json(
    { status: "error", code: "ACADEMY_SETTINGS_UNAVAILABLE" },
    { status: 503 }
  );
}

export async function GET() {
  if (!isAdminPanelEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }
  try {
    await requireAdminSession();
    const data = await readAcademySettingsAdmin();
    return NextResponse.json(
      { status: "success", data },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminPanelEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }
  try {
    const session = await requireAdminSession();
    await validateAdminWriteRequest(request);

    const rawBody = await request.json().catch(() => null);
    const parsed = academySettingsMutationSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          status: "error",
          code: "ACADEMY_SETTINGS_INVALID_REQUEST",
          errors: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const rawRequestId = request.headers.get("x-request-id");
    const requestId = rawRequestId && UUID_REGEX.test(rawRequestId) ? rawRequestId : randomUUID();

    const data = await writeAcademySettingsAtomically(parsed.data, session.uid, requestId);

    return NextResponse.json(
      { status: "success", data },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return failure(error);
  }
}
