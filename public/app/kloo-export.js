/* Browser-only CSV export. Account tokens are never read or transmitted. */
(() => {
  'use strict';
  let previousUrl = null;
  const cell = value => {
    let text = String(value ?? '');
    // Keep user-entered labels as text when opened in a spreadsheet.
    if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const amount = value => Number.isFinite(Number(value)) ? Number(value).toFixed(2).replace('.', ',') : '';
  function buildCsv(data, currency) {
    const rows = [['Type', 'Catégorie', 'Nom', `Montant (${currency || 'EUR'})`, 'Cible', 'Date / période', 'Statut']];
    rows.push(['Budget', '', 'Budget total du mois', amount(data.totalBudget), '', data.monthKey, '']);
    for (const item of data.envelopes || []) rows.push(['Enveloppe', item.categoryId, '', amount(item.plannedAmount), '', data.monthKey, '']);
    for (const item of data.transactions || []) rows.push(['Dépense', item.categoryId, item.name, amount(item.amount), '', item.dayLabel, '']);
    for (const item of data.recurringExpenses || []) rows.push(['Dépense fixe', item.categoryId, item.name, amount(item.amount), '', `Jour ${item.dayOfMonth}`, item.isActive ? 'Actif' : 'Inactif']);
    for (const item of data.savingsGoals || []) rows.push(['Épargne', '', item.name, amount(item.currentAmount), amount(item.targetAmount), '', 'Objectif']);
    return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
  }
  function notice(message, url, filename) {
    document.getElementById('kloo-export-notice')?.remove();
    const box = document.createElement('aside');
    box.id = 'kloo-export-notice';
    box.setAttribute('role', url ? 'status' : 'alert');
    box.style.cssText = 'position:fixed;bottom:24px;left:16px;right:16px;margin:auto;max-width:480px;padding:20px;background:#fff;color:#18202d;border:1px solid #c7d7ed;border-radius:16px;box-shadow:0 12px 40px #18202d30;z-index:2147483647;font:15px/1.6 sans-serif';
    const text = document.createElement('p'); text.textContent = message; box.appendChild(text);
    if (url) {
      const link = document.createElement('a'); link.href = url; link.download = filename;
      link.textContent = 'Télécharger le CSV à nouveau'; link.style.cssText = 'display:block;color:#2558a0;text-decoration:underline;margin:10px 0';
      box.appendChild(link);
    }
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Fermer';
    close.style.cssText = 'padding:8px 14px;border:1px solid #c7d7ed;border-radius:8px;background:#eef3fa;color:#18202d;cursor:pointer';
    close.onclick = () => { box.remove(); if (previousUrl === url && url) { URL.revokeObjectURL(url); previousUrl = null; } };
    box.appendChild(close); document.body.appendChild(box);
  }
  window.KlooExport = (data, currency) => {
    try {
      const content = buildCsv(data, currency);
      const filename = `kloo-export-${/^\d{4}-\d{2}$/.test(data.monthKey) ? data.monthKey : 'budget'}.csv`;
      if (previousUrl) { URL.revokeObjectURL(previousUrl); previousUrl = null; }
      const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' })); previousUrl = url;
      const link = document.createElement('a'); link.href = url; link.download = filename; link.style.display = 'none';
      document.body.appendChild(link); link.click(); link.remove();
      notice('Téléchargement lancé. Le fichier contient le budget et les dépenses du mois affiché, les dépenses fixes et les objectifs d’épargne. Retrouve-le dans les téléchargements de ton navigateur.', url, filename);
    } catch {
      notice('Impossible de préparer le fichier CSV. Actualise Kloo puis réessaie. Si le problème persiste, contacte contact@kloo.site.');
    }
  };
})();
