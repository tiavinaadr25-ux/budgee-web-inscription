import push from '../../server/web-push.cjs';
export default async () => {
  const result=await push.runScheduledPush();
  console.log('Kloo Web Push:',result); // Counts only. Never log endpoints, keys or financial data.
};
// Netlify scheduled functions cannot be invoked through a public URL.
export const config={schedule:'*/5 * * * *'};
