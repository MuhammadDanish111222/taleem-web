import { getAuth } from "firebase-admin/auth";
import { initializeApp, cert, getApps } from "firebase-admin/app";

async function grantAdmin() {
  if (process.argv.length < 3) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/grant-admin.ts <UID>");
    process.exit(1);
  }

  const uid = process.argv[2];

  if (!getApps().length) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      console.error("Missing Firebase Admin credentials in .env.local");
      process.exit(1);
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  const auth = getAuth();

  try {
    const userRecord = await auth.getUser(uid);
    const currentClaims = userRecord.customClaims || {};

    // Merge existing claims with admin: true
    await auth.setCustomUserClaims(uid, {
      ...currentClaims,
      admin: true,
    });

    console.log(`\nSuccessfully granted admin claim to user: ${userRecord.email} (${uid})`);
    console.log("Important: The user must sign out and sign back in to receive the new claim.");
  } catch (error) {
    console.error("Error granting admin claim:", error);
    process.exit(1);
  }
}

grantAdmin();
