// Keep runtime dependencies visible to Netlify's ESM file tracer. The shared
// CommonJS worker's require() calls become dynamic during its transpilation.
import '@supabase/supabase-js';
import 'web-push';
import push from '../../server/web-push.cjs';
export default async () => {
  const result=await push.runScheduledPush();
  console.log('Kloo Web Push:',result); // Counts only. Never log endpoints, keys or financial data.
};
// Netlify scheduled functions cannot be invoked through a public URL.
export const config={schedule:'*/5 * * * *'};
