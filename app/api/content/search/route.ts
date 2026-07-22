import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { searchPublicResources } from "@/lib/search/resourceSearch";
import { ResourceError } from "@/lib/resources/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const boardId = searchParams.get("boardId") ?? "";
    const classId = searchParams.get("classId") ?? "";
    const query = searchParams.get("q") ?? "";
    const subjectId = searchParams.get("subjectId") || undefined;
    const typeStr = searchParams.get("type") || undefined;
    const limitStr = searchParams.get("limit") || undefined;

    const limit = limitStr ? parseInt(limitStr, 10) : undefined;

    const results = await searchPublicResources({
      boardId,
      classId,
      query,
      subjectId,
      type: typeStr as any,
      limit,
    });

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 422 }
      );
    }

    if (error instanceof ResourceError) {
      if (error.code === "HIERARCHY_INACTIVE") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
