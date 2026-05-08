import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { TenantContext } from '@gigflow/shared';
import { logger } from './logger.js';

const JWKS = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);

/**
 * Verify an Entra ID Bearer token. Throws on invalid/missing claims.
 */
export async function verifyEntraToken(
  authHeader: string | undefined | null,
  expectedAudience: string,
  opts: { requiredScopes?: string[] } = {},
): Promise<TenantContext & { scopes: string[] }> {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new AuthError('missing_bearer', 'missing bearer token', 401);
  }
  const token = authHeader.slice(7);
  const { payload } = await jwtVerify(token, JWKS, {
    audience: expectedAudience,
  }).catch((err) => {
    logger.warn({ err: String(err) }, 'jwt verify failed');
    throw new AuthError('invalid_token', String(err), 401);
  });

  if (!payload.tid) throw new AuthError('no_tenant', 'missing tid', 401);
  if (!payload.oid) throw new AuthError('no_object_id', 'missing oid', 401);

  const roles = (payload.roles as string[] | undefined) ?? [];
  const scopes =
    typeof payload.scp === 'string' ? payload.scp.split(' ') : [];

  if (opts.requiredScopes && opts.requiredScopes.length > 0) {
    const ok = opts.requiredScopes.every((s) => scopes.includes(s));
    if (!ok) {
      throw new AuthError(
        'insufficient_scope',
        `required scope ${opts.requiredScopes.join(',')}, got ${scopes.join(',') || 'none'}`,
        403,
      );
    }
  }

  return {
    tenantId: String(payload.tid),
    userId: String(payload.oid),
    name: typeof payload.name === 'string' ? payload.name : '',
    roles,
    scopes,
  };
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
