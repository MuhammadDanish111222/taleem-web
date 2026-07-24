import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/session';
import { callAiService } from '@/lib/internalApi/callAiService';
import { validateAdminWriteRequest } from '@/lib/security/adminWrite';
import { isAdminPanelEnabled } from '@/lib/config/adminPanel';
import { DomainError } from '@/lib/services/admin/catalogueService';

function mapErrorToResponse(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
    return NextResponse.json({ status: 'error', message: 'Unauthenticated' }, { status: 401 });
  }
  if (error instanceof Error && error.message === 'UNAUTHORIZED') {
    return NextResponse.json({ status: 'error', message: 'Unauthorized' }, { status: 403 });
  }
  if (error instanceof DomainError && error.code === 'FORBIDDEN') {
    return NextResponse.json({ status: 'error', message: error.message }, { status: 403 });
  }

  const statusCode = typeof (error as { status?: unknown })?.status === 'number'
    ? (error as { status: number }).status
    : 500;
  return NextResponse.json(
    { status: 'error', message: error instanceof Error ? error.message : 'JSONL ingestion request failed' },
    { status: statusCode }
  );
}

export async function POST(req: NextRequest) {
  if (!isAdminPanelEnabled()) {
    return NextResponse.json({ status: 'error', message: 'Not Found' }, { status: 404 });
  }

  try {
    // Authentication and cookie-write protections must complete before body parsing.
    const session = await requireAdminSession();
    await validateAdminWriteRequest(req);
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
      'jsonl_ingest',
      { requestId: req.headers.get('x-request-id') ?? undefined }
    );

    return NextResponse.json(
      { status: 'success', data: result },
      { status: 202 }
    );
  } catch (error) {
    return mapErrorToResponse(error);
  }
}
