import { runLifecycleEmails } from '../../server/lifecycle-emails';
export default async () => { console.log('Kloo lifecycle emails:',await runLifecycleEmails()); };
export const config={schedule:'*/5 * * * *'};
