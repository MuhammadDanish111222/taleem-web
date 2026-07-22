import * as fs from "fs";
import * as path from "path";
import { PDFDocument } from "pdf-lib";

async function generateTestPdfs() {
  const dir = path.join(__dirname, "../tests/fixtures");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1. Valid PDF
  const validDoc = await PDFDocument.create();
  validDoc.addPage([500, 500]);
  const validBytes = await validDoc.save();
  fs.writeFileSync(path.join(dir, "valid.pdf"), validBytes);

  // 2. Encrypted PDF
  // pdf-lib does not support creating encrypted PDFs easily in the free version.
  // We can just create a dummy one that looks like encrypted by copying valid and changing some bytes,
  // or we can use another tool. For testing pdf-lib's rejection, we can mock it or use an actual encrypted PDF.
  // We'll write a mock test for encrypted.

  // 3. Corrupt PDF
  const corruptBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n"); // Truncated
  fs.writeFileSync(path.join(dir, "corrupt.pdf"), corruptBytes);

  // 4. Invalid Magic Bytes
  fs.writeFileSync(path.join(dir, "invalid-magic.pdf"), Buffer.from("NOT-A-PDF-1.4\n"));

  console.log("Fixtures created");
}

generateTestPdfs();
