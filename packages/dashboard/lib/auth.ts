import NextAuth, { type DefaultSession } from 'next-auth';
import EntraID from 'next-auth/providers/microsoft-entra-id';

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    EntraID({
      clientId: process.env.AUTH_ENTRA_CLIENT_ID,
      clientSecret: process.env.AUTH_ENTRA_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      authorization: {
        params: {
          scope: `openid profile email offline_access api://${FUNCTIONS_APP_ID}/orders.write api://${FUNCTIONS_APP_ID}/orders.read api://${MCP_APP_ID}/mcp.read`,
        },
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
