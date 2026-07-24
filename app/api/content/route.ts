import { NextRequest, NextResponse } from "next/server";
import { listPublicResources } from "@/lib/resources/public";
import { ResourceError } from "@/lib/resources/errors";
import { ZodError } from "zod";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query: Record<string, any> = {};

    searchParams.forEach((value, key) => {
      if (value !== "") {
        query[key] = value;
      }
    });

    const result = await listPublicResources(query as any);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "private, no-cache, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    if (error instanceof ResourceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.code === "HIERARCHY_INACTIVE" || error.code === "VALIDATION_FAILED" ? 400 : 500,
          headers: {
            "Cache-Control": "private, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
          },
        }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: error.issues },
        {
          status: 400,
          headers: {
            "Cache-Control": "private, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
          },
        }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-cache, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  }
}
