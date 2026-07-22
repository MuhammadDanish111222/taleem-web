import { getAdminFirestore } from "../lib/firebase/admin";
import { CURRENT_SEARCH_SCHEMA_VERSION, computeSearchFields } from "../lib/search/normalize";

export interface BackfillResult {
  totalDocs: number;
  updatedDocs: number;
  skippedDocs: number;
}

export async function runBackfillResourceSearch(): Promise<BackfillResult> {
  const db = getAdminFirestore();
  const snapshot = await db.collection("resources").get();

  let updatedDocs = 0;
  let skippedDocs = 0;

  const batchSize = 400;
  let batch = db.batch();
  let operationCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    const needsUpdate =
      data.searchSchemaVersion !== CURRENT_SEARCH_SCHEMA_VERSION ||
      !Array.isArray(data.searchTokens) ||
      !Array.isArray(data.searchPrefixes);

    if (needsUpdate) {
      const searchFields = computeSearchFields(data.title || "", CURRENT_SEARCH_SCHEMA_VERSION);
      batch.update(doc.ref, {
        searchTokens: searchFields.searchTokens,
        searchPrefixes: searchFields.searchPrefixes,
        searchSchemaVersion: searchFields.searchSchemaVersion,
      });

      updatedDocs++;
      operationCount++;

      if (operationCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        operationCount = 0;
      }
    } else {
      skippedDocs++;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }

  return {
    totalDocs: snapshot.docs.length,
    updatedDocs,
    skippedDocs,
  };
}

if (require.main === module) {
  runBackfillResourceSearch()
    .then((result) => {
      console.log(`Backfill completed successfully.`);
      console.log(`Total: ${result.totalDocs}, Updated: ${result.updatedDocs}, Skipped: ${result.skippedDocs}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Backfill failed:", err);
      process.exit(1);
    });
}
