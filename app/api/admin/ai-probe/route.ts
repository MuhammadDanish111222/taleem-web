import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/auth/session';
import { callAiService } from '@/lib/internalApi/callAiService';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    const result = await callAiService(
      '/api/v1/internal/verify',
      'GET',
      null,
      session.uid,
      session.admin,
      'admin_probe'
    );
    return NextResponse.json({ status: 'success', aiServiceResponse: result });
  } catch (error: any) {
    const statusCode = error.status || 500;
    return NextResponse.json(
      { status: 'error', message: error.message || 'AI Probe Failed' },
      { status: statusCode }
    );
  }
}
