export function parseMoney(value) {
  const text = String(value ?? '').trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/.test(text)) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount <= 999999999 ? Math.round((amount + Number.EPSILON) * 100) / 100 : null;
}
export function applyDeposit(goal, amount) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Montant invalide');
  const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
  return { ...goal, currentAmount: round(goal.currentAmount + amount), monthlyContribution: round(goal.monthlyContribution + amount) };
}
export function inputAmountFontSize(value, maximum = 38) {
  const length = String(value ?? '').replace(/\s/g, '').length;
  return Math.max(16, Math.min(maximum, Math.floor(maximum * 5 / Math.max(length, 5))));
}
export function notify(message) {
  if (typeof document === 'undefined') return;
  document.getElementById('kloo-save-feedback')?.remove();
  const box = document.createElement('div'); box.id = 'kloo-save-feedback'; box.setAttribute('role', 'status');
  box.textContent = message;
  box.style.cssText = 'position:fixed;bottom:108px;left:20px;right:20px;max-width:440px;margin:auto;padding:14px 18px;background:#182f31;color:white;border-radius:14px;box-shadow:0 6px 24px #0002;z-index:2147483647;font:15px/1.5 sans-serif;pointer-events:none';
  document.body.appendChild(box); setTimeout(() => box.remove(), 4500);
}
