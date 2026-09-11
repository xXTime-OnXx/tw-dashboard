import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
export type AuthEnv = {
  ACCESS_ISSUER?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  APP_ORIGIN?: string;
};
const keys = new Map<string, JWTVerifyGetKey>();
export async function authenticate(request: Request, env: AuthEnv, providedKeys?: JWTVerifyGetKey) {
  if (!env.ACCESS_ISSUER || !env.ACCESS_AUD || !env.OWNER_EMAIL || !env.APP_ORIGIN)
    throw Error('Authentication not configured');
  if (new URL(request.url).origin !== env.APP_ORIGIN) throw Error('Host not permitted');
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_ISSUER))
    throw Error('Invalid issuer');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw Error('Authentication required');
  if (!keys.has(env.ACCESS_ISSUER))
    keys.set(
      env.ACCESS_ISSUER,
      createRemoteJWKSet(new URL(env.ACCESS_ISSUER + '/cdn-cgi/access/certs')),
    );
  const { payload } = await jwtVerify(token, providedKeys ?? keys.get(env.ACCESS_ISSUER)!, {
    issuer: env.ACCESS_ISSUER,
    audience: env.ACCESS_AUD,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'email'],
  });
  if (payload.email !== env.OWNER_EMAIL) throw Error('Owner access only');
  return env.OWNER_EMAIL;
}
