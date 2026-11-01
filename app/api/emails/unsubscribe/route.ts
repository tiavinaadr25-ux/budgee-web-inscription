import { emailDatabase, validUnsubscribeToken } from '../../../../server/lifecycle-emails';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function credentials(request:Request){const url=new URL(request.url);const user=url.searchParams.get('user')||'',token=url.searchParams.get('token')||'';return {user,token,valid:validUnsubscribeToken(user,token)}}
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"};
function page(message:string,form=''){return '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emails Kloo</title><body style="font:17px/1.7 Arial,sans-serif;max-width:520px;margin:70px auto;padding:20px;color:#18202d"><h1 style="font-weight:400">Emails Kloo</h1><p>'+message+'</p>'+form+'<p><a href="/connexion">Retour à Kloo</a></p></body></html>'}
export async function GET(request:Request){
 if(!credentials(request).valid)return new Response(page('Ce lien est invalide.'),{status:400,headers});
 return new Response(page('Tu peux arrêter les emails automatiques de bienvenue, de suivi d’essai et de paiement Kloo. Ton compte et ton accès restent disponibles.',
  '<form method="post"><button style="border:0;background:#2558a0;color:white;padding:14px 20px;border-radius:9px;font:inherit">Me désinscrire de ces emails</button></form>'),{headers});
}
export async function POST(request:Request){
 const {user,valid}=credentials(request);if(!valid)return new Response(page('Ce lien est invalide.'),{status:400,headers});
 try{const result=await emailDatabase().from('lifecycle_email_preferences').upsert({user_id:user,enabled:false,updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(result.error)throw Error('Storage unavailable');return new Response(page('Ta désinscription est enregistrée. Tu ne recevras plus ces emails automatiques. Les emails de sécurité et de connexion sont gérés séparément.'),{headers});
 }catch{return new Response(page('La désinscription est temporairement indisponible. Réessaie dans un instant.'),{status:503,headers})}
}
