import {emailConfiguration,emailDatabase,emailRolloutReady} from '../../../../server/lifecycle-emails';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){const c=emailConfiguration();let storageReady=false;if(c.missing.length===0&&c.valid){try{storageReady=await emailRolloutReady(emailDatabase())}catch{}}
 return Response.json({available:c.ready&&storageReady,enabled:c.enabled,campaigns:['budget-2026-11-12'],configuration:{missing:c.missing,valid:c.valid,storageReady}},{headers:{'Cache-Control':'no-store'}})}
