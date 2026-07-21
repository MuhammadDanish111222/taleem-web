import "server-only";
import { cookies } from "next/headers";
import { getAdminAuth } from "@/lib/firebase/admin";
import { DecodedIdToken } from "firebase-admin/auth";

export type SessionResult =
  | { type: "valid"; decodedToken: DecodedIdToken }
  | { type: "unauthenticated"; error: string }
  | { type: "unauthorized"; error: string; decodedToken: DecodedIdToken };

export async function getSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    return { type: "unauthenticated", error: "Missing session cookie" };
  }

  try {
    const decodedToken = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    return { type: "valid", decodedToken };
  } catch (error) {
    console.error("Session verification failed:", error);
    return { type: "unauthenticated", error: "Invalid or expired session" };
  }
}

export async function requireSession(): Promise<DecodedIdToken> {
  const result = await getSession();
  if (result.type === "unauthenticated") {
    throw new Error("UNAUTHENTICATED");
  }
  return (result as any).decodedToken; // Either valid or unauthorized has decodedToken
}

export async function requireAdminSession(): Promise<DecodedIdToken> {
  const result = await getSession();

  if (result.type === "unauthenticated") {
    throw new Error("UNAUTHENTICATED");
  }

  if (result.type === "valid" && result.decodedToken.admin !== true) {
    // Note: The getSession function currently doesn't check 'admin' specifically
    // to classify as 'unauthorized' vs 'valid' because it's a generic session check.
    // Let's do the check here.
    throw new Error("UNAUTHORIZED");
  }

  return (result as any).decodedToken;
}
