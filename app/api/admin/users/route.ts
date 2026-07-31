import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { requireAdminSession } from "@/lib/auth/session";
import { validateAdminWriteRequest } from "@/lib/security/adminWrite";
import {
  listStudentUsers,
  setStudentSubscription,
} from "@/lib/services/users/userService";
import { DomainError } from "@/lib/services/admin/catalogueService";

const subscriptionUpdateSchema = z
  .object({
    uid: z.string().min(1).max(128),
    subscriptionActive: z.boolean(),
  })
  .strict();

function errorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid user update" }, { status: 400 });
  }
  if (error instanceof DomainError && error.code === "FORBIDDEN") {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (error instanceof Error && error.message === "USER_NOT_FOUND") {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (error instanceof Error && error.message === "INVALID_USER_CURSOR") {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  console.error("Admin users API failed", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const result = await listStudentUsers(
      request.nextUrl.searchParams.get("cursor") ?? undefined,
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminSession();
    await validateAdminWriteRequest(request);
    const input = subscriptionUpdateSchema.parse(await request.json());
    const user = await setStudentSubscription(
      admin.uid,
      input.uid,
      input.subscriptionActive,
    );
    return NextResponse.json(
      { user },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
