import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdminSession } from "@/lib/auth/session";
import { DomainError } from "@/lib/services/admin/catalogueService";
import { publishResource, hideResource, archiveResource, restoreArchivedResource } from "@/lib/services/admin/resourceService";
import { ResourceError } from "@/lib/resources/errors";
import { revalidateTag } from "next/cache";
import { z } from "zod";

const mutationSchema = z.object({
  action: z.enum(["publish", "hide", "archive", "restore"]),
});

function mapErrorToResponse(error: unknown) {
  if (error instanceof ResourceError) {
    switch (error.code) {
      case "NOT_FOUND": return NextResponse.json({ error: error.message }, { status: 404 });
      case "INVALID_TRANSITION": return NextResponse.json({ error: error.message }, { status: 409 });
      case "MISSING_VERSION": return NextResponse.json({ error: error.message }, { status: 409 });
    }
  }

  if (error instanceof DomainError) {
    switch (error.code) {
      case "VALIDATION": return NextResponse.json({ error: error.message }, { status: 422 });
      case "NOT_FOUND": return NextResponse.json({ error: error.message }, { status: 404 });
      case "CONFLICT": return NextResponse.json({ error: error.message }, { status: 409 });
      case "FORBIDDEN": return NextResponse.json({ error: error.message }, { status: 403 });
    }
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Validation failed", details: error.errors }, { status: 422 });
  }

  if (error instanceof Error) {
    if (error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }
  }

  console.error("Resource Mutation Error:", error);
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await validateOriginAndCSRF(request);
    const session = await requireAdminSession();
    
    const body = await request.json();
    const { action } = mutationSchema.parse(body);

    const resolvedParams = await params;
    const { id: resourceId } = resolvedParams;

    let resource;
    switch (action) {
      case "publish":
        resource = await publishResource({ uid: session.uid }, resourceId);
        break;
      case "hide":
        resource = await hideResource({ uid: session.uid }, resourceId);
        break;
      case "archive":
        resource = await archiveResource({ uid: session.uid }, resourceId);
        break;
      case "restore":
        resource = await restoreArchivedResource({ uid: session.uid }, resourceId);
        break;
    }

    // Invalidate public caches for this resource scope
    // @ts-ignore: Next.js 16+ type signature workaround
    revalidateTag("resources");
    // @ts-ignore
    revalidateTag(`resources:${resource.boardId}:${resource.classId}:${resource.subjectId}`);
    // @ts-ignore
    revalidateTag(`resource:${resourceId}`);

    return NextResponse.json({ success: true, resource }, { status: 200 });
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
