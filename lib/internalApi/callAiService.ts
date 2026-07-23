import 'server-only';
import { signInternalJwt } from '../internalAuth/signInternalJwt';

export interface AiServiceOptions {
  requestId?: string;
  headers?: Record<string, string>;
}

export async function callAiService(
  endpoint: string,
  method: string,
  body: any,
  uid: string,
  isAdmin: boolean = false,
  feature: string = 'general',
  options: AiServiceOptions = {}
): Promise<any> {
  const aiServiceUrl = process.env.AI_SERVICE_INTERNAL_URL;
  if (!aiServiceUrl) {
    throw new Error('AI_SERVICE_INTERNAL_URL is not defined');
  }

  const token = await signInternalJwt(uid, isAdmin, feature, options.requestId);
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  const url = endpoint.startsWith('/') ? `${aiServiceUrl}${endpoint}` : `${aiServiceUrl}/${endpoint}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const detailMessage = errorData?.detail
      ? typeof errorData.detail === 'object'
        ? JSON.stringify(errorData.detail)
        : errorData.detail
      : response.statusText;
      
    const error = new Error(`AI Service Error (${response.status}): ${detailMessage}`);
    (error as any).status = response.status;
    (error as any).errorData = errorData;
    throw error;
  }

  return response.json();
}
