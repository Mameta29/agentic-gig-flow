import { CosmosClient } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';

async function main() {
  const c = new CosmosClient({
    endpoint: process.env.COSMOS_ENDPOINT!,
    aadCredentials: new DefaultAzureCredential(),
  });
  const orders = c.database('gigflow').container('orders');
  const { resources: total } = await orders.items
    .query('SELECT VALUE COUNT(1) FROM c')
    .fetchAll();
  console.log('total orders:', total[0]);
  const { resources: byMonth } = await orders.items
    .query(
      'SELECT LEFT(c.createdAt,7) as ym, COUNT(1) as cnt, SUM(c.amountJpyc) as total FROM c GROUP BY LEFT(c.createdAt,7)',
    )
    .fetchAll();
  console.log('by month:');
  byMonth
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .forEach((r) =>
      console.log('  ' + r.ym, r.cnt + '件', r.total.toLocaleString() + ' JPYC'),
    );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
