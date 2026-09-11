import { it, expect } from 'vitest';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { authenticate } from '../apps/dashboard/worker/auth.ts';
import worker from '../apps/dashboard/worker/index.ts';
it('rejects missing configuration and unsigned production requests', async () => {
  const response = await worker.fetch(
    new Request('https://private.example/api/v1/worlds'),
    {} as never,
    { waitUntil: () => {} },
  );
  expect(response.status).toBe(401);
  await expect(authenticate(new Request('https://private.example'), {})).rejects.toThrow();
});
it('verifies signature, expiry, audience, host and exact owner', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'test' }] });
  const env = {
    ACCESS_ISSUER: 'https://test.cloudflareaccess.com',
    ACCESS_AUD: 'dashboard',
    OWNER_EMAIL: 'owner@example.test',
    APP_ORIGIN: 'https://private.example',
  };
  const token = async (email: string, aud = 'dashboard', expiry = '1h') =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' })
      .setIssuer(env.ACCESS_ISSUER)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(expiry)
      .sign(privateKey);
  const request = (t: string, host = 'https://private.example') =>
    new Request(host + '/api/v1/worlds', { headers: { 'Cf-Access-Jwt-Assertion': t } });
  expect(await authenticate(request(await token(env.OWNER_EMAIL)), env, keys)).toBe(
    env.OWNER_EMAIL,
  );
  await expect(
    authenticate(request(await token('other@example.test')), env, keys),
  ).rejects.toThrow();
  await expect(
    authenticate(request(await token(env.OWNER_EMAIL, 'wrong')), env, keys),
  ).rejects.toThrow();
  await expect(
    authenticate(request(await token(env.OWNER_EMAIL, 'dashboard', '-1h')), env, keys),
  ).rejects.toThrow();
  await expect(
    authenticate(request(await token(env.OWNER_EMAIL), 'https://alternate.workers.dev'), env, keys),
  ).rejects.toThrow();
});
