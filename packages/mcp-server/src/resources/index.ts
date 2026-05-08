import type { ToolContext } from '../tools/index.js';

export type ResourceDef = {
  uriTemplate: string;
  match: (uri: string) => Record<string, string> | null;
  describe: (params: Record<string, string>) => {
    uri: string;
    name: string;
    mimeType: string;
  };
  read: (
    params: Record<string, string>,
    ctx: ToolContext,
  ) => Promise<{ contents: { uri: string; mimeType: string; text: string }[] }>;
};

function regexFromTemplate(t: string): { re: RegExp; params: string[] } {
  const params: string[] = [];
  const pattern = t
    .replace(/\//g, '\\/')
    .replace(/\{([^}]+)\}/g, (_m, p1) => {
      params.push(p1);
      return '([^/]+)';
    });
  return { re: new RegExp(`^${pattern}$`), params };
}

function makeResource(
  uriTemplate: string,
  name: (params: Record<string, string>) => string,
  mimeType: string,
  read: ResourceDef['read'],
): ResourceDef {
  const { re, params } = regexFromTemplate(uriTemplate);
  return {
    uriTemplate,
    match: (uri) => {
      const m = uri.match(re);
      if (!m) return null;
      const out: Record<string, string> = {};
      params.forEach((p, i) => (out[p] = m[i + 1]!));
      return out;
    },
    describe: (params) => ({
      uri: uriTemplate.replace(/\{([^}]+)\}/g, (_, p) => params[p] ?? `{${p}}`),
      name: name(params),
      mimeType,
    }),
    read,
  };
}

export const resources: ResourceDef[] = [
  makeResource(
    'gigflow://orders/{orderId}',
    (p) => `Order ${p.orderId}`,
    'application/json',
    async (p, ctx) => {
      const order = await ctx.cosmos.getOrder(p.orderId!);
      if (!order) throw new Error('not_found');
      const uri = `gigflow://orders/${p.orderId}`;
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(order, null, 2),
          },
        ],
      };
    },
  ),
  makeResource(
    'gigflow://accounts/{accountId}',
    (p) => `Account ${p.accountId}`,
    'application/json',
    async (p, ctx) => {
      const accounts = await ctx.cosmos.listAllAccounts();
      const acct = accounts.find((a) => a.id === p.accountId);
      if (!acct) throw new Error('not_found');
      const uri = `gigflow://accounts/${p.accountId}`;
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(acct, null, 2),
          },
        ],
      };
    },
  ),
  makeResource(
    'gigflow://journal/{yearMonth}',
    (p) => `Journal ${p.yearMonth}`,
    'text/markdown',
    async (p, ctx) => {
      const orders = await ctx.cosmos.listOrders({
        yearMonth: p.yearMonth!,
        status: 'bookkept',
        limit: 200,
      });
      const md = ['# 月次仕訳', `**${p.yearMonth}**`, ''];
      for (const o of orders) {
        if (!o.bookkeepingArtifacts) continue;
        const j = o.bookkeepingArtifacts.journalEntry;
        md.push(
          `- ${j.dateLocal} | ${j.description} | 借方 ${j.debit.account} ${j.debit.amount} / 貸方 ${j.credit.account} ${j.credit.amount}`,
        );
      }
      const uri = `gigflow://journal/${p.yearMonth}`;
      return {
        contents: [{ uri, mimeType: 'text/markdown', text: md.join('\n') }],
      };
    },
  ),
  makeResource(
    'gigflow://reports/withholding/{worker}/{year}',
    (p) => `Withholding ${p.worker} ${p.year}`,
    'application/json',
    async (p, ctx) => {
      const orders = await ctx.cosmos.listOrders({
        workerGithubLogin: p.worker!,
        limit: 500,
      });
      const inYear = orders.filter((o) => o.createdAt.startsWith(p.year!));
      const uri = `gigflow://reports/withholding/${p.worker}/${p.year}`;
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                worker: p.worker,
                year: Number(p.year),
                totalPaymentsJpyc: inYear.reduce((s, o) => s + o.amountJpyc, 0),
                count: inYear.length,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  ),
];
