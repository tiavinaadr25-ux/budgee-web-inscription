import { lifecycleTemplates } from './lifecycle-email-templates';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export type EmailKind = 'welcome' | 'check_in' | 'trial_expired' | 'mobile_confirmed' | 'mobile_expiring' | 'mobile_expired' | 'reengagement';
type EmailJob = { id: string; user_id: string; kind: EmailKind; recipient_email: string; payload: Record<string, unknown> };
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function emailConfiguration() {
 const names=['BREVO_API_KEY','BREVO_SENDER_EMAIL','EMAIL_UNSUBSCRIBE_SECRET','SITE_URL','SUPABASE_SERVICE_ROLE_KEY'];
 const missing=names.filter(name=>!process.env[name]?.trim());
 if(!(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim())missing.push('SUPABASE_URL');
 let origin='';try{const site=new URL(process.env.SITE_URL||'');if(site.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(site.hostname))origin=site.origin}catch{}
 const enabled=process.env.EMAIL_AUTOMATION_ENABLED==='true';
 const senderEmail=process.env.BREVO_SENDER_EMAIL?.trim()||'';
 const replyToEmail=process.env.BREVO_REPLY_TO_EMAIL?.trim()||senderEmail;
 const senderName=(process.env.BREVO_SENDER_NAME?.trim()||'Kloo').slice(0,80);
 const secret=process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()||'';
 const dailyLimit=Number(process.env.EMAIL_DAILY_LIMIT||100);
 const valid=Boolean(origin&&emailPattern.test(senderEmail)&&emailPattern.test(replyToEmail)&&secret.length>=32
  &&Number.isInteger(dailyLimit)&&dailyLimit>=1&&dailyLimit<=1000);
 return {ready:enabled&&missing.length===0&&valid,enabled,missing,valid,origin,senderEmail,senderName,replyToEmail,secret,dailyLimit};
}
export function emailDatabase() {
 return createClient((process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)!,process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {auth:{persistSession:false,autoRefreshToken:false}});
}
export function unsubscribeToken(userId:string,secret=emailConfiguration().secret) {
 return createHmac('sha256',secret).update('kloo-email-unsubscribe-v1:'+userId).digest('hex');
}
export function validUnsubscribeToken(userId:string,token:string) {
 const {secret}=emailConfiguration();
 if(secret.length<32||!/^[0-9a-f-]{36}$/i.test(userId)||! /^[0-9a-f]{64}$/i.test(token))return false;
 return timingSafeEqual(Buffer.from(token,'hex'),Buffer.from(unsubscribeToken(userId,secret),'hex'));
}
const entities:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const escape=(text:unknown)=>String(text??'').replace(/[&<>"']/g,c=>entities[c]);
export function renderLifecycleEmail(kind:EmailKind,payload:Record<string,unknown>,origin:string,unsubscribe:string) {
 const template=lifecycleTemplates[kind];if(!template)throw Error('Unknown email type');
 const name=String(payload.name||'').trim().split(/\s+/)[0].slice(0,60);
 let date='';if(payload.access_ends_at){const d=new Date(String(payload.access_ends_at));if(Number.isFinite(d.getTime()))date=new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'Indian/Antananarivo'}).format(d)}
 const html=String(template.html)
  .replace('{% if params.FIRSTNAME %}Bonjour {{ params.FIRSTNAME }},{% else %}Bonjour,{% endif %}',name?'Bonjour '+escape(name)+',':'Bonjour,')
  .replaceAll('{% if params.ACCESS_ENDS_AT %}le {{ params.ACCESS_ENDS_AT }}{% else %}à la date indiquée dans ton compte{% endif %}',date?'le '+escape(date):'à la date indiquée dans ton compte')
  .replaceAll('https://kloo.site',escape(origin))
  .replaceAll('{{ params.UNSUBSCRIBE_URL }}',escape(unsubscribe));
 const text=html.replace(/<head[\s\S]*?<\/head>/i,'').replace(/<!--[\s\S]*?-->/g,'')
  .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,'$2 : $1')
  .replace(/<br\s*\/?\s*>|<\/(?:p|h1|td)>/gi,'\n').replace(/<[^>]+>/g,'')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
  .replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim();
 return {subject:template.subject,text,html};
}
export async function emailRolloutReady(admin=emailDatabase()) {
 const result=await admin.from('lifecycle_email_settings').select('rollout_version,welcome_since,other_since').eq('singleton',true).maybeSingle();
 return !result.error&&result.data?.rollout_version===2&&
  Date.parse(result.data.welcome_since)===Date.parse('2026-11-06T23:00:00Z')&&
  Date.parse(result.data.other_since)===Date.parse('2026-10-22T22:00:00Z');
}
export async function sendLifecycleEmail(job:EmailJob,admin=emailDatabase(),transport:typeof fetch=fetch) {
 const config=emailConfiguration();if(!config.ready)return 'disabled';
 const relevant=await admin.rpc('lifecycle_email_is_relevant',{p_id:job.id});
 if(relevant.error)throw Error('Email recipient verification unavailable');
 if(!relevant.data){const canceled=await admin.from('lifecycle_email_outbox').update({status:'canceled',lease_until:null}).eq('id',job.id).eq('status','processing');if(canceled.error)throw Error('Email storage unavailable');return 'canceled'}
 if(!emailPattern.test(job.recipient_email))throw Error('Invalid email recipient');
 const unsubscribe=config.origin+'/api/emails/unsubscribe?user='+encodeURIComponent(job.user_id)+'&token='+unsubscribeToken(job.user_id,config.secret);
 const rendered=renderLifecycleEmail(job.kind,job.payload,config.origin,unsubscribe);
 try{
  const response=await transport('https://api.brevo.com/v3/smtp/email',{
   method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','api-key':process.env.BREVO_API_KEY!.trim()},
   body:JSON.stringify({sender:{name:config.senderName,email:config.senderEmail},to:[{email:job.recipient_email}],
    replyTo:{email:config.replyToEmail,name:config.senderName},subject:rendered.subject,htmlContent:rendered.html,textContent:rendered.text,
    headers:{idempotencyKey:job.id},tags:['kloo',job.kind]}),signal:AbortSignal.timeout(5000)});
  const body=await response.json().catch(()=>({}));
  const alreadyProcessed=body.code==='duplicate_parameter'&&/idempotenc/i.test(String(body.message||''));
  if(!response.ok&&!alreadyProcessed)throw Error('provider_http_'+response.status);
  if(response.ok&&typeof body.messageId!=='string')throw Error('provider_invalid_response');
  const saved=await admin.from('lifecycle_email_outbox').update({status:'sent',sent_at:new Date().toISOString(),lease_until:null,
   provider_message_id:typeof body.messageId==='string'?body.messageId:null,last_error:null}).eq('id',job.id).eq('status','processing');
  if(saved.error)throw Error('storage_after_send');
  return 'sent';
 }catch(error){
  // Never log email addresses, bodies or provider responses. Retry only inside the provider deduplication window.
  const reason=error instanceof Error&&/^(provider_http_\d+|provider_invalid_response|storage_after_send)$/.test(error.message)?error.message:'delivery_uncertain';
  const failed=await admin.from('lifecycle_email_outbox').update({status:'pending',lease_until:null,
   next_attempt_at:new Date(Date.now()+5*60000).toISOString(),last_error:reason}).eq('id',job.id).eq('status','processing');
  if(failed.error)throw Error('Email retry storage unavailable');
  return 'retry';
 }
}
export async function runLifecycleEmails() {
 const config=emailConfiguration();if(!config.ready)return {configured:false,enabled:config.enabled};
 const admin=emailDatabase();
 if(!await emailRolloutReady(admin))return {configured:false,enabled:config.enabled,awaitingAudienceMigration:true};
 const collected=await admin.rpc('collect_lifecycle_emails');if(collected.error)throw Error('Apply the lifecycle email SQL migration');
 const claimed=await admin.rpc('claim_lifecycle_emails',{p_daily_limit:config.dailyLimit});if(claimed.error)throw Error('Email queue unavailable');
 const results=await Promise.all((claimed.data||[]).map(async (job:EmailJob)=>{try{return await sendLifecycleEmail(job,admin)}catch{return 'error'}}));
 return {configured:true,queued:collected.data,checked:results.length,sent:results.filter(x=>x==='sent').length,
  canceled:results.filter(x=>x==='canceled').length,retry:results.filter(x=>x==='retry').length,failed:results.filter(x=>x==='error').length};
}
