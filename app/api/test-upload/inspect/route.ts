import { NextRequest, NextResponse } from "next/server";
import { getUploadTransaction } from "@/lib/repositories/firestore/uploadTransactionRepository";
import { getResource } from "@/lib/repositories/firestore/resourceRepository";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get("transactionId");
  const resourceId = searchParams.get("resourceId");

  try {
    let transaction = null;
    let resource = null;

    if (transactionId) {
      transaction = await getUploadTransaction(transactionId);
    }
    if (resourceId) {
      resource = await getResource(resourceId);
    }

    return NextResponse.json({ transaction, resource });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
