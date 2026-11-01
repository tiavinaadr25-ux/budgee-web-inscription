import {emailConfiguration,emailDatabase} from '../../../../server/lifecycle-emails';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){const c=emailConfiguration();let storageReady=false;if(c.missing.length===0&&c.valid){try{storageReady=!(await emailDatabase().from('lifecycle_email_outbox').select('id').limit(0)).error}catch{}}
 return Response.json({available:c.ready&&storageReady,enabled:c.enabled,configuration:{missing:c.missing,valid:c.valid,storageReady}},{headers:{'Cache-Control':'no-store'}})}
