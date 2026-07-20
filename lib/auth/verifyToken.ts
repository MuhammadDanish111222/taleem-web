import { getAdminAuth } from '../firebase/admin';

export class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function verifyRequest(request: Request): Promise<{ uid: string; isAdmin: boolean }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid authorization header', 'AUTH_INVALID_TOKEN');
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const adminAuth = getAdminAuth();
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const isAdmin = !!decodedToken.admin;
    return { uid, isAdmin };
  } catch (error: any) {
    throw new AuthError('Invalid or expired token', 'AUTH_INVALID_TOKEN');
  }
}
