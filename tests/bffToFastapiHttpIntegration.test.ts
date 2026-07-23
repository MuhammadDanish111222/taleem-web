import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose';
import { callAiService } from '@/lib/internalApi/callAiService';
import { GET as aiProbeHandler } from '@/app/api/admin/ai-probe/route';
import { NextRequest } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';

vi.mock('@/lib/auth/session', () => ({
  requireAdminSession: vi.fn().mockResolvedValue({ uid: 'probe-admin-777', admin: true }),
}));

async function getEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

describe('Genuine HTTP Integration Test (BFF Helper & Next.js AI Probe Route -> FastAPI)', () => {
  let privateKeyPem: string;
  let publicKeyPem: string;
  let serverProcess: ChildProcess | null = null;
  let port: number;
  const originalEnv = process.env;
  const KEY_ID = 'http-integration-kid';

  beforeEach(async () => {
    process.env = { ...originalEnv };
    port = await getEphemeralPort();

    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    privateKeyPem = await exportPKCS8(privateKey);
    publicKeyPem = await exportSPKI(publicKey);

    process.env.INTERNAL_JWT_PRIVATE_KEY = privateKeyPem;
    process.env.INTERNAL_JWT_KEY_ID = KEY_ID;
    process.env.AI_SERVICE_INTERNAL_URL = `http://127.0.0.1:${port}`;

    const aiServiceDir = path.resolve(__dirname, '../../taleem-ai-service');
    if (!fs.existsSync(aiServiceDir)) {
      throw new Error(`Integration test failure: taleem-ai-service repository not found at ${aiServiceDir}`);
    }

    const pythonExe = process.platform === 'win32'
      ? path.join(aiServiceDir, '.venv', 'Scripts', 'python.exe')
      : path.join(aiServiceDir, '.venv', 'bin', 'python');
    const pythonBin = fs.existsSync(pythonExe) ? pythonExe : 'python';

    let serverLogs = '';
    serverProcess = spawn(pythonBin, ['-u', 'tests/run_fastapi_server.py', KEY_ID, String(port)], {
      cwd: aiServiceDir,
      env: { ...process.env, MOCK_PUBLIC_KEY_PEM: publicKeyPem },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (data) => { serverLogs += data.toString(); });
    serverProcess.stderr?.on('data', (data) => { serverLogs += data.toString(); });

    serverProcess.stdin?.write(publicKeyPem);
    serverProcess.stdin?.end();

    // Wait for FastAPI server to start listening (up to 10s)
    let started = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) {
          started = true;
          break;
        }
      } catch {}
    }

    if (!started) {
      throw new Error(`FastAPI test server failed to start on OS-assigned port ${port}. Server logs:\n${serverLogs}`);
    }
  }, 25000);

  afterEach(() => {
    if (serverProcess) {
      serverProcess.kill('SIGKILL');
      serverProcess = null;
    }
    process.env = originalEnv;
  });

  it('1. calls callAiService directly over real HTTP and verifies claim preservation in FastAPI', async () => {
    const result = await callAiService(
      '/api/v1/internal/verify',
      'GET',
      null,
      'http-user-777',
      true,
      'bff_http_integration',
      { requestId: 'req-http-888' }
    );

    expect(result.status).toBe('authenticated');
    expect(result.uid).toBe('http-user-777');
    expect(result.is_admin).toBe(true);
    expect(result.feature).toBe('bff_http_integration');
    expect(result.request_id).toBe('req-http-888');
  }, 10000);

  it('2. executes Next.js /api/admin/ai-probe route handler over real HTTP to FastAPI', async () => {
    const req = new NextRequest(`http://127.0.0.1:${port}/api/admin/ai-probe`);
    const res = await aiProbeHandler(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.aiServiceResponse.status).toBe('authenticated');
    expect(body.aiServiceResponse.uid).toBe('probe-admin-777');
    expect(body.aiServiceResponse.is_admin).toBe(true);
    expect(body.aiServiceResponse.feature).toBe('admin_probe');
  }, 10000);
});

