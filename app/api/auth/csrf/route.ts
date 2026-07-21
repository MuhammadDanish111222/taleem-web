import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

export async function GET() {
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const cookieStore = await cookies();
  
  cookieStore.set("__csrf", csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });

  return NextResponse.json(
    { csrfToken },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
