import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase/admin";
import { ensureStudentUser } from "@/lib/services/users/userService";

export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let token;
  try {
    token = await getAdminAuth().verifyIdToken(authorization.slice(7));
  } catch {
    return NextResponse.json(
      { error: "Unauthenticated" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const user = await ensureStudentUser(token);
    return NextResponse.json(
      { user },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Student profile synchronization failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to initialize user profile" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
