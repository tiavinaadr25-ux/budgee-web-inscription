import { NextRequest } from 'next/server';
import push from '../../../server/web-push.cjs';
import { ApiRouteError, ensureAllowedOrigin, requireAuthenticatedUser, jsonResponse, optionsResponse } from '../_lib/security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function OPTIONS(request:NextRequest){return optionsResponse(request)}
export async function GET(request:NextRequest){
 try{return jsonResponse(request,await push.publicConfiguration(),{headers:{'Cache-Control':'no-store'}})}
 catch{return jsonResponse(request,{available:false},{headers:{'Cache-Control':'no-store'}})}
}
export async function POST(request:NextRequest){
 try{
  ensureAllowedOrigin(request);
  const user=await requireAuthenticatedUser(request);
  if(!user.email_confirmed_at)throw new ApiRouteError('Confirme ton email pour activer les notifications.',403);
  const raw=await request.text();if(raw.length>12000)throw new ApiRouteError('Demande trop volumineuse.',413);
  let input;try{input=JSON.parse(raw)}catch{throw new ApiRouteError('Demande invalide.',400)}
  return jsonResponse(request,await push.subscriptionAction(user.id,input),{headers:{'Cache-Control':'no-store'}});
 }catch(error){
  const known=error instanceof ApiRouteError||Boolean(error&&typeof error==='object'&&'status' in error);
  const status=known?Number((error as {status:number}).status):503;
  return jsonResponse(request,{error:known?(error as Error).message:'Les notifications sont temporairement indisponibles.'},{status});
 }
}
