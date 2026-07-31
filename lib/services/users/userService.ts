import "server-only";

import { DecodedIdToken } from "firebase-admin/auth";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  StudentAuthProvider,
  StudentUserDto,
  StudentUserProfile,
} from "@/lib/users/types";
import { writeAuditLogTransactionally } from "@/lib/repositories/firestore/adminAuditLogRepository";

const USERS_COLLECTION = "users";
const PAGE_SIZE = 50;
const FIRST_PAGE_CACHE_MS = 30_000;

type StudentUsersPage = {
  users: StudentUserDto[];
  nextCursor: string | null;
};

let firstPageCache: { expiresAt: number; value: StudentUsersPage } | undefined;
let firstPageRequest: Promise<StudentUsersPage> | undefined;
let usersCacheGeneration = 0;

function invalidateStudentUsersCache(): void {
  usersCacheGeneration += 1;
  firstPageCache = undefined;
  firstPageRequest = undefined;
}

function authProviderFor(token: DecodedIdToken): StudentAuthProvider {
  return token.firebase?.sign_in_provider === "anonymous" ? "anonymous" : "google";
}

export type AskAccountTier = "anonymous" | "google" | "premium";

/**
 * Reads the trusted subscription/profile source exactly once for an Ask call.
 * Missing profiles remain non-premium and derive only the authentication
 * provider from the already-verified Firebase token.
 */
export async function getStudentAskAccountTier(
  token: DecodedIdToken,
): Promise<AskAccountTier> {
  const snapshot = await getAdminFirestore()
    .collection(USERS_COLLECTION)
    .doc(token.uid)
    .get();
  const profile = snapshot.exists
    ? (snapshot.data() as Partial<StudentUserProfile>)
    : undefined;
  if (profile?.subscriptionActive === true) return "premium";
  return profile?.authProvider === "anonymous" ||
    (!profile && authProviderFor(token) === "anonymous")
    ? "anonymous"
    : "google";
}

function toDto(profile: StudentUserProfile): StudentUserDto {
  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    authProvider: profile.authProvider,
    subscriptionActive: profile.subscriptionActive,
    createdAt: profile.createdAt.toDate().toISOString(),
    updatedAt: profile.updatedAt.toDate().toISOString(),
  };
}

/**
 * Creates a profile once and otherwise performs a read-only identity check.
 * A write occurs for an existing user only when Firebase identity fields changed.
 */
export async function ensureStudentUser(token: DecodedIdToken): Promise<StudentUserDto> {
  const db = getAdminFirestore();
  const ref = db.collection(USERS_COLLECTION).doc(token.uid);
  const identity = {
    uid: token.uid,
    email: token.email ?? null,
    displayName: token.name ?? null,
    photoURL: token.picture ?? null,
    authProvider: authProviderFor(token),
  };

  const profile = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const now = Timestamp.now();

    if (!snapshot.exists) {
      const created: StudentUserProfile = {
        ...identity,
        subscriptionActive: false,
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
      };
      transaction.create(ref, created);
      return created;
    }

    const existing = snapshot.data() as StudentUserProfile;
    const identityChanged =
      existing.email !== identity.email ||
      existing.displayName !== identity.displayName ||
      existing.photoURL !== identity.photoURL ||
      existing.authProvider !== identity.authProvider;

    if (!identityChanged) {
      return {
        ...existing,
        uid: token.uid,
        subscriptionActive: existing.subscriptionActive === true,
      };
    }

    const updated = {
      ...existing,
      ...identity,
      subscriptionActive: existing.subscriptionActive === true,
      updatedAt: now,
      schemaVersion: 1 as const,
    };
    transaction.update(ref, {
      ...identity,
      updatedAt: now,
      schemaVersion: 1,
    });
    return updated;
  });

  // A newly created profile or changed identity must appear promptly for the
  // local administrator. Invalidating on the uncommon /api/users/me call keeps
  // the common admin refresh path read-efficient.
  invalidateStudentUsersCache();
  return toDto(profile);
}

function encodeCursor(profile: StudentUserProfile): string {
  return Buffer.from(
    JSON.stringify({
      createdAtMillis: profile.createdAt.toMillis(),
      uid: profile.uid,
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): { createdAtMillis: number; uid: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      !Number.isSafeInteger(parsed.createdAtMillis) ||
      typeof parsed.uid !== "string" ||
      !parsed.uid
    ) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new Error("INVALID_USER_CURSOR");
  }
}

async function queryStudentUsers(cursor?: string): Promise<StudentUsersPage> {
  const db = getAdminFirestore();
  let query = db
    .collection(USERS_COLLECTION)
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "asc")
    .limit(PAGE_SIZE);

  if (cursor) {
    const decoded = decodeCursor(cursor);
    query = query.startAfter(
      Timestamp.fromMillis(decoded.createdAtMillis),
      decoded.uid,
    );
  }

  const snapshot = await query.get();
  const profiles = snapshot.docs.map((doc) => ({
    ...(doc.data() as StudentUserProfile),
    uid: doc.id,
    subscriptionActive: doc.data().subscriptionActive === true,
  }));
  return {
    users: profiles.map(toDto),
    nextCursor:
      profiles.length === PAGE_SIZE
        ? encodeCursor(profiles[profiles.length - 1])
        : null,
  };
}

export async function listStudentUsers(cursor?: string): Promise<StudentUsersPage> {
  if (cursor) return queryStudentUsers(cursor);

  const now = Date.now();
  if (firstPageCache && firstPageCache.expiresAt > now) {
    return firstPageCache.value;
  }
  if (firstPageRequest) return firstPageRequest;

  const requestGeneration = usersCacheGeneration;
  const request = queryStudentUsers()
    .then((value) => {
      if (requestGeneration === usersCacheGeneration) {
        firstPageCache = {
          expiresAt: Date.now() + FIRST_PAGE_CACHE_MS,
          value,
        };
      }
      return value;
    })
    .finally(() => {
      if (firstPageRequest === request) firstPageRequest = undefined;
    });
  firstPageRequest = request;

  return request;
}

export async function setStudentSubscription(
  adminUid: string,
  targetUid: string,
  subscriptionActive: boolean,
): Promise<StudentUserDto> {
  const db = getAdminFirestore();
  const ref = db.collection(USERS_COLLECTION).doc(targetUid);

  const updated = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new Error("USER_NOT_FOUND");
    }

    const before = snapshot.data() as StudentUserProfile;
    const now = Timestamp.now();
    const after: StudentUserProfile = {
      ...before,
      uid: targetUid,
      subscriptionActive,
      updatedAt: now,
    };

    transaction.update(ref, { subscriptionActive, updatedAt: now });
    writeAuditLogTransactionally(transaction, {
      actorUid: adminUid,
      requestId: null,
      action: "user.subscription_changed",
      entityType: "user",
      entityId: targetUid,
      before: { subscriptionActive: before.subscriptionActive === true },
      after: { subscriptionActive },
    });
    return after;
  });

  invalidateStudentUsersCache();
  return toDto(updated);
}
