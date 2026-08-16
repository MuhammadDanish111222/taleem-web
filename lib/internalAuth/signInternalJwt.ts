import 'server-only';
import { SignJWT, importPKCS8 } from 'jose';
import { v4 as uuidv4 } from 'uuid';

export type InternalJwtAudience = 'taleem-ai-service' | 'taleem-test-generator';

export async function signInternalJwt(
  uid: string,
  isAdmin: boolean = false,
  feature: string = 'general',
  requestId?: string,
  accountTier?: "anonymous" | "google" | "premium",
  audience: InternalJwtAudience = 'taleem-ai-service',
): Promise<string> {
  const privateKey = process.env.INTERNAL_JWT_PRIVATE_KEY;
  const keyId = process.env.INTERNAL_JWT_KEY_ID;

  if (!privateKey) {
    throw new Error('INTERNAL_JWT_PRIVATE_KEY is not defined');
  }
  
  if (!keyId) {
    throw new Error('INTERNAL_JWT_KEY_ID is not defined');
  }

  // Handle newlines in environment variable
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
  const key = await importPKCS8(formattedPrivateKey, 'RS256');

  const jti = uuidv4();
  const reqId = requestId || uuidv4();

  const jwt = await new SignJWT({
    uid,
    admin: isAdmin,
    feature,
    request_id: reqId,
    ...(accountTier ? { account_tier: accountTier } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuedAt()
    .setJti(jti)
    .setAudience(audience)
    .setIssuer('taleem-web')
    .setExpirationTime('60s')
    .sign(key);

  return jwt;
}

/** A deliberately separate audience prevents this token from reaching Railway. */
export async function signTestGeneratorJwt(uid: string, requestId: string): Promise<string> {
  return signInternalJwt(uid, false, 'test_generator', requestId, undefined, 'taleem-test-generator');
}
