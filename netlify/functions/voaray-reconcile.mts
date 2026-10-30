import { reconcilePendingVoarayOrders } from '../../app/api/_lib/voaray-reconcile';
export default async () => {
  console.log('Voaray reconciliation:', await reconcilePendingVoarayOrders());
};
export const config = { schedule: '*/5 * * * *' };
