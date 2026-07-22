import "server-only";
import { getAdminFirestore } from "../../firebase/admin";
import { Resource } from "../../resources/types";

export async function listAdminResources(cursor?: string, limit: number = 20) {
  const adminDb = getAdminFirestore();
  let query = adminDb.collection("resources")
    .orderBy("createdAt", "desc")
    .limit(limit);

  if (cursor) {
    const doc = await adminDb.collection("resources").doc(cursor).get();
    if (doc.exists) {
      query = query.startAfter(doc);
    }
  }

  const snapshot = await query.get();
  return {
    resources: snapshot.docs.map(doc => doc.data() as Resource),
    nextCursor: snapshot.docs.length === limit ? snapshot.docs[snapshot.docs.length - 1].id : null
  };
}

export async function getAdminResourceDetail(resourceId: string) {
  const adminDb = getAdminFirestore();
  const doc = await adminDb.collection("resources").doc(resourceId).get();
  if (!doc.exists) return null;
  
  const versionsSnapshot = await adminDb.collection("resources").doc(resourceId).collection("versions").orderBy("createdAt", "desc").get();
  const versions = versionsSnapshot.docs.map(d => d.data());

  return {
    resource: doc.data() as Resource,
    versions
  };
}
