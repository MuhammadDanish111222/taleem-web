import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getAdminFirestore } from "@/lib/firebase/admin";
import {
  ensureStudentUser,
  listStudentUsers,
  setStudentSubscription,
} from "@/lib/services/users/userService";

async function clearCollection(name: string) {
  const snapshot = await getAdminFirestore().collection(name).get();
  if (snapshot.empty) return;
  const batch = getAdminFirestore().batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

describe("student user service", () => {
  beforeEach(async () => {
    await clearCollection("users");
    await clearCollection("admin_audit_logs");
  });

  it("creates one anonymous profile with subscription off", async () => {
    const token = {
      uid: "anonymous-1",
      firebase: { sign_in_provider: "anonymous" },
    } as any;
    const first = await ensureStudentUser(token);
    const second = await ensureStudentUser(token);

    expect(first.subscriptionActive).toBe(false);
    expect(first.authProvider).toBe("anonymous");
    expect(second.uid).toBe(first.uid);
    expect((await getAdminFirestore().collection("users").get()).size).toBe(1);
  });

  it("preserves subscription when identity changes from anonymous to Google", async () => {
    await ensureStudentUser({
      uid: "student-1",
      firebase: { sign_in_provider: "anonymous" },
    } as any);
    await setStudentSubscription("admin-1", "student-1", true);

    const upgraded = await ensureStudentUser({
      uid: "student-1",
      email: "student@example.com",
      name: "Student",
      firebase: { sign_in_provider: "google.com" },
    } as any);

    expect(upgraded.authProvider).toBe("google");
    expect(upgraded.email).toBe("student@example.com");
    expect(upgraded.subscriptionActive).toBe(true);
  });

  it("lets the admin toggle subscription and records an audit event", async () => {
    await ensureStudentUser({
      uid: "student-1",
      firebase: { sign_in_provider: "anonymous" },
    } as any);
    const updated = await setStudentSubscription("admin-1", "student-1", true);
    const listed = await listStudentUsers();
    const audits = await getAdminFirestore()
      .collection("admin_audit_logs")
      .where("entityId", "==", "student-1")
      .get();

    expect(updated.subscriptionActive).toBe(true);
    expect(listed.users).toHaveLength(1);
    expect(listed.users[0].subscriptionActive).toBe(true);
    expect(audits.size).toBe(1);
    expect(audits.docs[0].data().action).toBe("user.subscription_changed");
  });
});
