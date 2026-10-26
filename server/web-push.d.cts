import type { SupabaseClient } from '@supabase/supabase-js';
declare const push: {
 database(): SupabaseClient;
 publicConfiguration(admin?: SupabaseClient): Promise<{available:boolean;publicKey?:string}>;
 subscriptionAction(userId:string,input:unknown,admin?:SupabaseClient):Promise<Record<string,unknown>>;
};
export = push;
