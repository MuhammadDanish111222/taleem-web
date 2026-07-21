import { signInternalJwt } from '../internalAuth/signInternalJwt';

export async function callAiService(
  endpoint: string,
  method: string,
  body: any,
  uid: string,
  isAdmin: boolean = false,
  feature: string = 'general'
): Promise<any> {
  const aiServiceUrl = process.env.AI_SERVICE_INTERNAL_URL;
  if (!aiServiceUrl) {
    throw new Error('AI_SERVICE_INTERNAL_URL is not defined');
  }

  const token = await signInternalJwt(uid, isAdmin, feature);
  
  const response = await fetch(`${aiServiceUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(
      `AI Service Error: ${response.status} ${response.statusText} ${
        errorData ? JSON.stringify(errorData) : ''
      }`
    );
  }

  return response.json();
}
