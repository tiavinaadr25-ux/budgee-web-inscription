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
const at=t=>raw.replace(/\bnow\(\)/g,"'"+t+"'::timestamptz");
await db.exec(at('2026-11-12T12:00:00Z'));
assert.equal((await db.query("select status from lifecycle_email_outbox where event_key='old-campaign:12'")).rows[0].status,'canceled');
await db.query('select collect_lifecycle_emails()');
let rows=(await db.query("select * from lifecycle_email_outbox where payload->>'campaign'='trial-followup-v1'")).rows;
assert.deepEqual(rows.map(r=>r.user_id).sort(),[id(2),id(12),id(13)].sort());
assert.ok(rows.every(r=>r.kind==='reengagement'));
const cutoff=(await db.query('select trial_followup_started_at from lifecycle_email_settings')).rows[0].trial_followup_started_at;
await db.exec(at('2026-11-12T12:01:00Z'));await db.query('select collect_lifecycle_emails()');
assert.equal(String((await db.query('select trial_followup_started_at from lifecycle_email_settings')).rows[0].trial_followup_started_at),String(cutoff));
rows=(await db.query("select * from lifecycle_email_outbox where payload->>'campaign'='trial-followup-v1'")).rows;
assert.equal(rows.length,4);assert.ok(rows.some(r=>r.user_id===id(3)));
await db.query('select collect_lifecycle_emails()');assert.equal((await db.query("select count(*)::int n from lifecycle_email_outbox where payload->>'campaign'='trial-followup-v1'")).rows[0].n,4);
const user2=rows.find(r=>r.user_id===id(2));await db.query("insert into billing_records values($1,'paid',1.99)",[id(2)]);
assert.equal((await db.query('select lifecycle_email_is_relevant($1) ok',[user2.id])).rows[0].ok,false);
console.log('PASS automatic follow-up at exactly 48h; no historical blast; no paid conversion/active/unconfirmed/opt-out/duplicate-active recipients; rerun stable; one-off canceled; payment rechecked');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
