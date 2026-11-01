import { createHmac, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export type EmailKind = 'welcome' | 'trial_expired' | 'mobile_confirmed' | 'mobile_expiring' | 'mobile_expired';
type EmailJob = { id: string; user_id: string; kind: EmailKind; recipient_email: string; payload: Record<string, unknown> };
const emailPattern = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
export function emailConfiguration() {
 const names=['BREVO_API_KEY','BREVO_SENDER_EMAIL','EMAIL_UNSUBSCRIBE_SECRET','SITE_URL','SUPABASE_SERVICE_ROLE_KEY'];
 const missing=names.filter(name=>!process.env[name]?.trim());
 if(!(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim())missing.push('SUPABASE_URL');
 let origin='';try{const site=new URL(process.env.SITE_URL||'');if(site.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(site.hostname))origin=site.origin}catch{}
 const enabled=process.env.EMAIL_AUTOMATION_ENABLED==='true';
 const senderEmail=process.env.BREVO_SENDER_EMAIL?.trim()||'';
 const senderName=(process.env.BREVO_SENDER_NAME?.trim()||'Kloo').slice(0,80);
 const secret=process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()||'';
 const dailyLimit=Number(process.env.EMAIL_DAILY_LIMIT||100);
 const valid=Boolean(origin&&emailPattern.test(senderEmail)&&secret.length>=32
  &&Number.isInteger(dailyLimit)&&dailyLimit>=1&&dailyLimit<=1000);
 return {ready:enabled&&missing.length===0&&valid,enabled,missing,valid,origin,senderEmail,senderName,secret,dailyLimit};
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
 const name=String(payload.name||'').trim().split(/\s+/)[0].slice(0,60);
 const greeting=name?'Bonjour '+name+',':'Bonjour,';
 let end='';if(payload.access_ends_at){const date=new Date(String(payload.access_ends_at));if(Number.isFinite(date.getTime()))end=new Intl.DateTimeFormat('fr-FR',{dateStyle:'long',timeZone:'Indian/Antananarivo'}).format(date)}
 const content:Record<EmailKind,{subject:string;title:string;paragraphs:string[];cta:string;path:string}>={
  welcome:{subject:'Bienvenue sur Kloo',title:'Un premier pas pour ton budget',paragraphs:[greeting,
   'Ton compte Kloo est prêt. Commence simplement : fixe ton budget, note ta première dépense, puis choisis un objectif d’épargne.',
   'Ton essai de 7 jours est sans carte. Tu peux retrouver l’état de ton accès dans l’application.'],cta:'Ouvrir Kloo',path:'/connexion'},
  trial_expired:{subject:'Ton essai Kloo est terminé',title:'Continue à suivre ton budget',paragraphs:[greeting,
   'Ton essai gratuit est terminé. Si tu souhaites continuer, choisis ton moyen de paiement depuis Kloo : 1,99 € par mois par carte, ou 9 000 Ar pour un mois par Mobile Money.',
   'Aucun paiement n’est prélevé automatiquement à la fin de l’essai. Reconnecte-toi avec ton compte habituel.'],cta:'Choisir mon paiement',path:'/paiement'},
  mobile_confirmed:{subject:'Ton paiement Mobile Money est confirmé',title:'Ton accès Kloo est actif',paragraphs:[greeting,
   'Voaray a confirmé ton paiement Mobile Money.'+(end?' Ton accès est actif jusqu’au '+end+'.':''),
   'Ce paiement est ponctuel, sans renouvellement automatique. Tu peux maintenant reprendre ton budget.'],cta:'Retrouver mon budget',path:'/connexion'},
  mobile_expiring:{subject:'Ton accès Mobile Money se termine bientôt',title:'Ton mois Kloo arrive à sa fin',paragraphs:[greeting,
   'Ton accès payé par Mobile Money se termine'+(end?' le '+end:' bientôt')+'. Aucun prélèvement automatique n’est prévu.',
   'Si tu souhaites continuer, tu pourras renouveler ton accès depuis Kloo à son échéance.'],cta:'Voir mon accès',path:'/paiement'},
  mobile_expired:{subject:'Ton accès Mobile Money est terminé',title:'Reprends Kloo quand tu veux',paragraphs:[greeting,
   'Ton mois d’accès payé par Mobile Money est terminé. Pour continuer, reconnecte-toi au même compte et choisis ton paiement.',
   'Un mois par Mobile Money coûte 9 000 Ar, sans renouvellement automatique. Si tu as déjà payé, utilise « J’ai déjà payé : vérifier mon accès » sans payer à nouveau.'],cta:'Renouveler mon accès',path:'/paiement'},
 };
 const item=content[kind];if(!item)throw Error('Unknown email type');
 const url=origin+item.path;
 const text=item.title+'\n\n'+item.paragraphs.join('\n\n')+'\n\n'+item.cta+' : '+url
  +'\n\nUne question ? Réponds à cet email.\nNe plus recevoir ces emails automatiques : '+unsubscribe;
 const html='<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#18202d"><table role="presentation" style="width:100%;padding:30px 12px"><tr><td align="center"><table role="presentation" style="max-width:560px;width:100%;background:#fff;border-radius:18px;padding:32px"><tr><td><p style="color:#2558a0;font-size:22px;margin:0 0 24px">Kloo</p><h1 style="font-size:25px;font-weight:500;line-height:1.3">'+escape(item.title)+'</h1>'
  +item.paragraphs.map(p=>'<p style="font-size:16px;line-height:1.7">'+escape(p)+'</p>').join('')
  +'<p style="margin:28px 0"><a href="'+escape(url)+'" style="display:inline-block;background:#2558a0;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none">'+escape(item.cta)+'</a></p><p style="font-size:14px;line-height:1.7">Une question ? Réponds à cet email.</p><p style="font-size:12px;color:#687385;line-height:1.7">Cet email concerne ton compte Kloo. <a style="color:#687385" href="'+escape(unsubscribe)+'">Ne plus recevoir ces emails automatiques</a></p></td></tr></table></td></tr></table></body></html>';
 return {subject:item.subject,text,html};
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
    replyTo:{email:config.senderEmail,name:config.senderName},subject:rendered.subject,htmlContent:rendered.html,textContent:rendered.text,
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
 const collected=await admin.rpc('collect_lifecycle_emails');if(collected.error)throw Error('Apply the lifecycle email SQL migration');
 const claimed=await admin.rpc('claim_lifecycle_emails',{p_daily_limit:config.dailyLimit});if(claimed.error)throw Error('Email queue unavailable');
 const results=await Promise.all((claimed.data||[]).map(async (job:EmailJob)=>{try{return await sendLifecycleEmail(job,admin)}catch{return 'error'}}));
 return {configured:true,queued:collected.data,checked:results.length,sent:results.filter(x=>x==='sent').length,
  canceled:results.filter(x=>x==='canceled').length,retry:results.filter(x=>x==='retry').length,failed:results.filter(x=>x==='error').length};
}
