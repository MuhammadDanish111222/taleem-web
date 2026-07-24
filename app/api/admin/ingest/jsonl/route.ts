import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/session';
import { callAiService } from '@/lib/internalApi/callAiService';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    const body = await req.json().catch(() => null);

    if (!body || !body.jsonl_content || typeof body.jsonl_content !== 'string' || !body.jsonl_content.trim()) {
      return NextResponse.json(
        { status: 'error', message: 'Missing or empty jsonl_content' },
        { status: 400 }
      );
    }

    const payload = {
      jsonl_content: body.jsonl_content,
      idempotency_key: body.idempotency_key || undefined,
      resource_version_id: body.resource_version_id || 'v1',
    };

    const result = await callAiService(
      '/api/v1/internal/ingest/jsonl',
      'POST',
      payload,
      session.uid,
      session.admin,
      'jsonl_ingest'
    );

    return NextResponse.json(
      { status: 'success', data: result },
      { status: 202 }
    );
  } catch (error: any) {
    const statusCode = error.status || 500;
    return NextResponse.json(
      { status: 'error', message: error.message || 'JSONL ingestion request failed' },
      { status: statusCode }
    );
  }
}
