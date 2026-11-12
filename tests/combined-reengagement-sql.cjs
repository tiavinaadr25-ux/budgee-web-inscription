const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz,deleted_at timestamptz);
create table profiles(id uuid primary key,full_name text);
create table subscriptions(id uuid primary key,user_id uuid,provider text,status text,trial_ends_at timestamptz,current_period_end_at timestamptz,created_at timestamptz);
create table voaray_orders(id uuid primary key,user_id uuid,subscription_id uuid,environment text,status text,access_ends_at timestamptz,amount numeric,currency text,created_at timestamptz);
create table billing_records(user_id uuid,status text,amount numeric);`);
const dir=path.join(__dirname,'../supabase/migrations');
await db.exec(fs.readFileSync(path.join(dir,'202611010001_lifecycle_emails.sql'),'utf8'));
await db.exec(fs.readFileSync(path.join(dir,'202611070001_email_rollout.sql'),'utf8'));
for(let n=1;n<=14;n++){
const email=n===11?'test10@example.test':'test'+n+'@example.test';
await db.query("insert into auth.users values($1,$2,$3,'2026-10-01T09:00:00Z',null)",[id(n),email,n===7?null:'2026-10-01T10:00:00Z']);
const end=n===9?null:n===1?'2026-11-10T11:59:59Z':n===3?'2026-11-10T12:01:00Z':'2026-11-10T12:00:00Z';
await db.query("insert into subscriptions values($1,$2,'stripe',$3,$4,$4,'2026-11-01T00:00:00Z')",[id(100+n),id(n),[6,11].includes(n)?'active':'canceled',end]);
}
await db.query('insert into billing_records values($1,\'paid\',1.99)',[id(4)]);
await db.query("insert into voaray_orders values($1,$2,$3,'production','completed','2026-11-11T12:00:00Z',9000,'MGA','2026-10-11T12:00:00Z')",[id(205),id(5),id(105)]);
await db.query('insert into lifecycle_email_preferences(user_id,enabled) values($1,false)',[id(8)]);
const raw=fs.readFileSync(path.join(dir,'202611120002_automatic_trial_followup.sql'),'utf8');
// Seed a queued manual campaign and one already sent, then install without
// applying the optional earlier campaign migration: both upgrade paths work.
await db.exec("alter table lifecycle_email_outbox drop constraint lifecycle_email_outbox_kind_check;");
for(const n of [12,14])await db.query("insert into lifecycle_email_outbox(user_id,recipient_email,event_key,kind,payload,status) values($1,$2,$3,'reengagement','{\"campaign\":\"budget-2026-11-12\"}',$4)",[id(n),'test'+n+'@example.test','old-campaign:'+n,n===14?'sent':'pending']);
const combined=fs.readFileSync(path.join(dir,'202611120003_combined_reengagement.sql'),'utf8');
const at=t=>combined.replace(/\bnow\(\)/g,"'"+t+"'::timestamptz");
await db.exec(at('2026-11-12T12:00:00Z'));
for(const table of ['lifecycle_email_settings','lifecycle_email_preferences','lifecycle_email_outbox']){
assert.equal((await db.query("select relrowsecurity from pg_class where oid=$1::regclass",['public.'+table])).rows[0].relrowsecurity,true);
for(const role of ['anon','authenticated']){
const privileges=(await db.query("select has_table_privilege($1,$2,'SELECT') as read,has_table_privilege($1,$2,'INSERT') as write",[role,'public.'+table])).rows[0];
assert.equal(privileges.read,false);assert.equal(privileges.write,false);
}
assert.equal((await db.query("select has_table_privilege('service_role',$1,'SELECT') as read",['public.'+table])).rows[0].read,true);
}
console.log('PASS all email tables enforce RLS and deny anonymous/authenticated reads and writes; service role retains access');
let rows=(await db.query("select * from lifecycle_email_outbox where kind='reengagement'")).rows;
assert.equal(rows.length,8);assert.equal(rows.filter(r=>r.status==='pending').length,7);
assert.ok(rows.some(r=>r.user_id===id(4)&&r.status==='pending'));assert.ok(rows.some(r=>r.user_id===id(5)&&r.status==='pending'));
const snapshot=(await db.query('select reengagement_backfill_at from lifecycle_email_settings')).rows[0].reengagement_backfill_at;
await db.exec(at('2026-11-12T12:01:00Z'));
assert.equal((await db.query("select count(*)::int n from lifecycle_email_outbox where kind='reengagement'")).rows[0].n,8);
assert.equal(String((await db.query('select reengagement_backfill_at from lifecycle_email_settings')).rows[0].reengagement_backfill_at),String(snapshot));
await db.query('select collect_lifecycle_emails()');assert.equal((await db.query("select count(*)::int n from lifecycle_email_outbox where kind='reengagement'")).rows[0].n,8);
for(const n of [15,16]){
await db.query("insert into auth.users values($1,$2,'2026-11-12T12:02:00Z','2026-11-12T12:01:00Z',null)",[id(n),'future'+n+'@example.test']);
await db.query("insert into subscriptions values($1,$2,'stripe','canceled',$3,$3,'2026-11-12T12:02:00Z')",[id(100+n),id(n),n===15?'2026-11-13T12:00:00Z':'2026-11-09T12:00:00Z']);
}
await db.exec(at('2026-11-15T11:59:59Z'));await db.query('select collect_lifecycle_emails()');
assert.ok(!(await db.query("select * from lifecycle_email_outbox where kind='reengagement' and user_id=$1",[id(15)])).rows.length);
await db.exec(at('2026-11-15T12:00:00Z'));await db.query('select collect_lifecycle_emails()');
const followup=(await db.query("select * from lifecycle_email_outbox where kind='reengagement' and user_id=$1",[id(15)])).rows;
assert.equal(followup.length,1);assert.equal(followup[0].payload.campaign,'trial-followup-v1');
assert.ok(!(await db.query("select * from lifecycle_email_outbox where kind='reengagement' and user_id=$1",[id(16)])).rows.length);
await db.query("update lifecycle_email_outbox set status='sent' where id=$1",[followup[0].id]);
await db.query('select collect_lifecycle_emails()');assert.equal((await db.query("select count(*)::int n from lifecycle_email_outbox where kind='reengagement' and user_id=$1",[id(15)])).rows[0].n,1);
const old=rows.find(r=>r.user_id===id(1));await db.query("update subscriptions set status='active' where user_id=$1",[id(1)]);
assert.equal((await db.query('select lifecycle_email_is_relevant($1) ok',[old.id])).rows[0].ok,false);
console.log('PASS historical trials + lapsed paid users once, existing sends suppressed, reruns stable, future J+2 exact, no double follow-up, and renewal excluded');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
