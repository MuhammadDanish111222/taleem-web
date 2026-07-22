import http from "http";
import { URL } from "url";
import { exec } from "child_process";
import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...valParts] = trimmed.split("=");
        const val = valParts.join("=").replace(/^["']|["']$/g, "").trim();
        if (key.trim()) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
}

async function authorizeDrive() {
  loadEnvLocal();

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("❌ ERROR: GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET must be set in .env.local before running authorization.");
    console.error("Please add your OAuth2 Client credentials to .env.local:");
    console.error("  GOOGLE_DRIVE_CLIENT_ID=your_client_id");
    console.error("  GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret");
    process.exit(1);
  }

  const port = 3100;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });

  console.log("🚀 Starting Google Drive OAuth Authorization...");
  console.log(`🔗 Redirect URI: ${redirectUri}`);
  console.log("\nOpening browser for Google authorization...\n");

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url!, `http://127.0.0.1:${port}`);
      if (reqUrl.pathname === "/oauth2callback") {
        const code = reqUrl.searchParams.get("code");
        const error = reqUrl.searchParams.get("error");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(`<h1>Authorization Failed</h1><p>${error}</p>`);
          console.error(`❌ Authorization failed: ${error}`);
          process.exit(1);
        }

        if (code) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h1>Authorization Successful!</h1><p>You can close this window and return to your terminal.</p>");
          
          server.close();

          console.log("🔑 Exchanging authorization code for tokens...");
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);

          const refreshToken = tokens.refresh_token;

          if (!refreshToken) {
            console.error("❌ WARNING: No refresh token returned. Ensure prompt=consent and access_type=offline were used.");
          } else {
            console.log("\n=======================================================");
            console.log("🔑 REFRESH TOKEN RECEIVED:");
            console.log(refreshToken);
            console.log("=======================================================\n");
          }

          console.log("📁 Creating folder 'Taleem AI Content' in your personal My Drive...");
          const drive = google.drive({ version: "v3", auth: oauth2Client });
          const folderRes = await drive.files.create({
            requestBody: {
              name: "Taleem AI Content",
              mimeType: "application/vnd.google-apps.folder",
            },
            fields: "id, name",
          });

          const folderId = folderRes.data.id;
          console.log("=======================================================");
          console.log("📁 CREATED FOLDER 'Taleem AI Content' IN MY DRIVE:");
          console.log("Folder Name:", folderRes.data.name);
          console.log("Folder ID:", folderId);
          console.log("=======================================================\n");

          console.log("✅ COMPLETE! Please update your .env.local with these settings:\n");
          console.log(`GOOGLE_DRIVE_AUTH_MODE=oauth_user`);
          console.log(`GOOGLE_DRIVE_CLIENT_ID=${clientId}`);
          console.log(`GOOGLE_DRIVE_CLIENT_SECRET=${clientSecret}`);
          console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${refreshToken || ""}`);
          console.log(`GOOGLE_DRIVE_CONTENT_FOLDER_ID=${folderId}`);
          console.log("\n=======================================================\n");

          process.exit(0);
        }
      }
    } catch (err: any) {
      console.error("❌ Error processing authorization callback:", err.message);
      res.writeHead(500, { "Content-Type": "text/html" });
      res.end(`<h1>Internal Error</h1><p>${err.message}</p>`);
      process.exit(1);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`Listening for OAuth callback on http://127.0.0.1:${port}/oauth2callback ...`);
    
    // Open browser automatically
    const startCmd = process.platform === "win32"
      ? `start "" "${authUrl}"`
      : process.platform === "darwin"
      ? `open "${authUrl}"`
      : `xdg-open "${authUrl}"`;

    exec(startCmd, (err) => {
      if (err) {
        console.log("\nIf browser did not open automatically, copy and paste this URL into your browser:\n");
        console.log(authUrl);
      }
    });
  });
}

authorizeDrive();
