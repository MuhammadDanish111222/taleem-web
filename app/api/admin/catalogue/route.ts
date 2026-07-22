import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdminSession } from "@/lib/auth/session";
import { catalogueMutationSchema } from "@/lib/validation/catalogue";
import { catalogueService, DomainError } from "@/lib/services/admin/catalogueService";
import { revalidateTag } from "next/cache";
import { ZodError } from "zod";

function mapErrorToResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: error.errors },
      { status: 400 }
    );
  }
  
  if (error instanceof DomainError) {
    switch (error.code) {
      case "VALIDATION": return NextResponse.json({ error: error.message }, { status: 400 });
      case "NOT_FOUND": return NextResponse.json({ error: error.message }, { status: 404 });
      case "CONFLICT": return NextResponse.json({ error: error.message }, { status: 409 });
      case "FORBIDDEN": return NextResponse.json({ error: error.message }, { status: 403 });
    }
  }
  
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (error instanceof Error && error.message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  console.error("Catalogue API Error:", error);
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
  try {
    await validateOriginAndCSRF(request);
    await requireAdminSession();
    
    const body = await request.json();
    const mutation = catalogueMutationSchema.parse(body);

    if (mutation.operation !== "create") {
       throw new DomainError("VALIDATION", "POST only supports create operations");
    }

    await catalogueService.handleMutation(mutation);
    
    // Immediate expiration: this route is hit directly by the admin panel, and a
    // newly created/edited catalogue node should be visible on the very next request.
    revalidateTag("catalogue", { expire: 0 });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await validateOriginAndCSRF(request);
    await requireAdminSession();
    
    const body = await request.json();
    const mutation = catalogueMutationSchema.parse(body);

    if (mutation.operation === "create") {
       throw new DomainError("VALIDATION", "PATCH does not support create operations");
    }

    await catalogueService.handleMutation(mutation);
    
    // Immediate expiration: this route is hit directly by the admin panel, and a
    // newly created/edited catalogue node should be visible on the very next request.
    revalidateTag("catalogue", { expire: 0 });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
