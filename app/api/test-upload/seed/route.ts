import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { Timestamp } from "firebase-admin/firestore";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const db = getAdminFirestore();

    // Seed Board: fbise
    await db.collection("boards").doc("fbise").set(
      {
        name: "Federal Board (FBISE)",
        slug: "fbise",
        active: true,
        displayOrder: 1,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // Seed Class: class-9
    await db.collection("boards").doc("fbise").collection("classes").doc("class-9").set(
      {
        name: "Class 9",
        slug: "class-9",
        active: true,
        displayOrder: 1,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // Seed Subject: physics
    await db
      .collection("boards")
      .doc("fbise")
      .collection("classes")
      .doc("class-9")
      .collection("subjects")
      .doc("physics")
      .set(
        {
          name: "Physics",
          slug: "physics",
          active: true,
          displayOrder: 1,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

    return NextResponse.json({
      success: true,
      message: "Seeded test hierarchy in Firestore: board 'fbise', class 'class-9', subject 'physics'",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
