/**
 * Tenant scoping helper. All Cosmos queries must go through a tenant-scoped
 * client; never query directly with arbitrary companyId.
 */
export type TenantContext = {
  tenantId: string;
  userId: string;
  roles: string[];
  name?: string;
};

export function requireRole(
  ctx: TenantContext,
  ...required: string[]
): void {
  const has = required.some((r) => ctx.roles.includes(r));
  if (!has) {
    throw new Error(
      `forbidden: required role ${required.join('|')}, got ${ctx.roles.join(',') || 'none'}`,
    );
  }
}

export function isWithinTenant(
  ctx: TenantContext,
  companyId: string,
): boolean {
  return ctx.tenantId === companyId;
}
