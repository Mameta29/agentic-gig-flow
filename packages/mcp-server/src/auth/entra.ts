import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);

export type McpAuthContext = {
  tenantId: string;
  userId: string;
  roles: string[];
  scopes: string[];
};

export async function verifyEntraToken(
  authHeader: string | undefined | null,
): Promise<McpAuthContext> {
  const audience = process.env.MCP_APP_AUDIENCE || 'api://gigflow-mcp';
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    throw new AuthError('missing_bearer', 401);
  }
  const token = authHeader.slice(7);
  const { payload } = await jwtVerify(token, JWKS, { audience }).catch(
    (err) => {
      throw new AuthError(`invalid_token:${String(err)}`, 401);
    },
  );
  if (!payload.tid) throw new AuthError('no_tenant', 401);
  if (!payload.oid) throw new AuthError('no_object_id', 401);
  const roles = (payload.roles as string[] | undefined) ?? [];
  const scopes =
    typeof payload.scp === 'string' ? payload.scp.split(' ') : [];
  if (!scopes.includes('mcp.read')) {
    throw new AuthError('insufficient_scope', 403);
  }
  if (!roles.includes('Accountant') && !roles.includes('Executive')) {
    throw new AuthError('forbidden_role', 403);
  }
  return {
    tenantId: String(payload.tid),
    userId: String(payload.oid),
    roles,
    scopes,
  };
}

export class AuthError extends Error {
  constructor(
    public code: string,
    public status: 401 | 403,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}
