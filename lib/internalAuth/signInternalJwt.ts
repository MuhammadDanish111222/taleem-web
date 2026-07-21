import { SignJWT, importPKCS8 } from 'jose';
import { v4 as uuidv4 } from 'uuid';

export async function signInternalJwt(
  uid: string,
  isAdmin: boolean = false,
  feature: string = 'general'
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
  const requestId = uuidv4();

  const jwt = await new SignJWT({
    uid,
    admin: isAdmin,
    feature,
    request_id: requestId,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuedAt()
    .setJti(jti)
    .setAudience('taleem-ai-service')
    .setIssuer('taleem-web')
    .setExpirationTime('60s')
    .sign(key);

  return jwt;
}
