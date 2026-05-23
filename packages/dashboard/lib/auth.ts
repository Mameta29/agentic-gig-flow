import NextAuth, { type DefaultSession } from 'next-auth';
import EntraID from 'next-auth/providers/microsoft-entra-id';

// TEMP DEBUG: wrap global fetch to log what the Entra token endpoint actually
// returns. The sign-in flow fails with "JWTs must use Compact JWS
// serialization" which means the token response has no usable id_token; this
// prints the raw response so we can see the real AADSTS error.
const g = globalThis as { __gigflowFetchPatched?: boolean };
if (!g.__gigflowFetchPatched) {
  g.__gigflowFetchPatched = true;
  const orig = globalThis.fetch;
  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const res = await orig(input, init);
    if (typeof url === 'string' && url.includes('/oauth2/v2.0/token')) {
      try {
        const text = await res.clone().text();
        // eslint-disable-next-line no-console
        console.log('[TOKEN_ENDPOINT_DEBUG]', res.status, text.slice(0, 900));
      } catch {
        /* ignore */
      }
    }
    return res;
  };
}

declare module 'next-auth' {
  interface Session {
    tenantId?: string;
    accessToken?: string;
    roles?: string[];
    user: { name?: string | null; email?: string | null } & DefaultSession['user'];
  }
}

const FUNCTIONS_APP_ID =
  process.env.FUNCTIONS_APP_ID || 'gigflow-functions';
const MCP_APP_ID = process.env.MCP_APP_ID || 'gigflow-mcp';

// Auth.js rewrites the discovered issuer's `{tenantid}` using the tenant
// segment of `issuer`. With `common`, the expected issuer stays `.../common/...`
// but the signed-in user's id_token carries `.../<real-tenant-guid>/...`, so
// validation fails ("JWTs must use Compact JWS serialization"). Pin the issuer
// to the real tenant id for this single-tenant demo deployment.
const TENANT_ID = process.env.AUTH_ENTRA_TENANT_ID || 'common';

const ENTRA_SCOPE = `openid profile email offline_access api://${FUNCTIONS_APP_ID}/orders.write api://${FUNCTIONS_APP_ID}/orders.read api://${MCP_APP_ID}/mcp.read`;

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  debug: true,
  providers: [
    EntraID({
      clientId: process.env.AUTH_ENTRA_CLIENT_ID,
      clientSecret: process.env.AUTH_ENTRA_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      authorization: { params: { scope: ENTRA_SCOPE } },
      // Entra v2 token endpoint rejects the code exchange when `scope` is empty
      // (AADSTS28003). Auth.js beta.25 does not forward the authorization scope
      // to the token request, so pass it explicitly here.
      token: { params: { scope: ENTRA_SCOPE } },
      // Override the default profile() — it calls Microsoft Graph for the user
      // photo, which breaks under Next.js standalone/Docker on entra-id
      // beta.25 ("JWTs must use Compact JWS serialization"). Read claims from
      // the id_token instead; we don't need the avatar.
      profile(profile) {
        return {
          id: profile.sub ?? profile.oid,
          name: profile.name ?? profile.preferred_username,
          email: profile.email ?? profile.preferred_username,
          image: null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.tenantId = (profile as { tid?: string } | undefined)?.tid;
        token.accessToken = account.access_token;
        token.roles =
          (profile as { roles?: string[] } | undefined)?.roles ?? [];
      }
      return token;
    },
    async session({ session, token }) {
      session.tenantId = token.tenantId as string | undefined;
      session.accessToken = token.accessToken as string | undefined;
      session.roles = (token.roles as string[] | undefined) ?? [];
      return session;
    },
  },
});
