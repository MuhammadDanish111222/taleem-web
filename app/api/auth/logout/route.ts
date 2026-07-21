import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebase/admin";
import { z } from "zod";

const logoutSchema = z.object({
  csrfToken: z.string().min(1, "CSRF token required"),
});

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    
    if (origin && host) {
      const originUrl = new URL(origin);
      if (originUrl.host !== host) {
        return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
      }
    }

    const body = await request.json();
    const result = logoutSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const csrfCookie = cookieStore.get("__csrf")?.value;

    if (!csrfCookie || csrfCookie !== result.data.csrfToken) {
      return NextResponse.json({ error: "CSRF token mismatch" }, { status: 403 });
    }

    const sessionCookie = cookieStore.get("__session")?.value;

    if (sessionCookie) {
      try {
        const auth = getAdminAuth();
        const decodedToken = await auth.verifySessionCookie(sessionCookie, true);
        
        // Revoke all refresh tokens for the user to invalidate sessions on every device.
        await auth.revokeRefreshTokens(decodedToken.uid);
      } catch (error) {
        // Ignore verification errors during logout, we will clear the cookie anyway.
        console.error("Error during session revocation:", error);
      }
    }

    // Clear the session cookie
    cookieStore.delete({
      name: "__session",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json(
      { success: true },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
