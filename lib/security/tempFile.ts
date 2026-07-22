import "server-only";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { getUploadConfig } from "../uploads/config";

export interface TempFile {
  filepath: string;
  writeStream: fs.WriteStream;
  cleanup: () => Promise<void>;
}

export async function createTempFile(): Promise<TempFile> {
  const config = getUploadConfig();
  const dir = config.tempDir || os.tmpdir();
  
  // Create a cryptographically random filename
  const randomName = crypto.randomBytes(16).toString("hex") + ".pdf";
  const filepath = path.join(dir, randomName);

  // Open exclusively (wx = Open for writing, fails if the file exists)
  // This avoids symlink attacks and race conditions.
  const writeStream = fs.createWriteStream(filepath, { flags: "wx", mode: 0o600 });

  const cleanup = async () => {
    return new Promise<void>((resolve) => {
      fs.unlink(filepath, (err) => {
        if (err && err.code !== "ENOENT") {
          console.error("Failed to delete temp file:", err);
        }
        resolve();
      });
    });
  };

  return {
    filepath,
    writeStream,
    cleanup,
  };
}
