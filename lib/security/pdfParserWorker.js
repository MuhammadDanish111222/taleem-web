const { parentPort, workerData } = require("worker_threads");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");

async function parse() {
  try {
    const { filepath } = workerData;
    // PDF-lib requires a buffer.
    // We read the file into a buffer here in the isolated worker
    // so the main thread is not blocked, and this worker can be
    // hard-terminated by the main thread if it takes too long.
    const buffer = fs.readFileSync(filepath);
    
    let isEncrypted = false;
    let pageCount = 0;

    try {
      const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      isEncrypted = doc.isEncrypted;
      pageCount = doc.getPageCount();
    } catch (err) {
      if (err.message && err.message.includes("encrypted")) {
        isEncrypted = true;
      } else {
        throw err;
      }
    }

    if (parentPort) {
      parentPort.postMessage({ success: true, isEncrypted, pageCount });
    }
  } catch (err) {
    if (parentPort) {
      parentPort.postMessage({ success: false, error: err.message || "Unknown PDF parsing error" });
    }
  }
}

parse();
