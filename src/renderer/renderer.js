'use strict';
const $ = id => document.getElementById(id);
const api = window.ranking;
let allCategories = [];
let running = false;
let pendingConfirm = null;
let latestResult = null;

const stages = {
  read: ['Reading saved Excel and HTML', 12],
  backup: ['Verifying numbered [REP] backup', 26],
  excel: ['Recalculating CODE formulas in Excel', 48],
  validate: ['Checking nine HTML sections and product IDs', 73],
  commit: ['Saving verified HTML / workbook', 89],
  done: ['Completed successfully', 100],
};
function setText(id, value) { $(id).textContent = String(value ?? ''); }
function formatDate(iso) {
  try { return new Date(iso).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}); }
  catch { return ''; }
}
function showError(error) {
  const message = error?.message || String(error);
  setText('progress-message', message);
  setText('progress-state', 'Error');
  $('progressfill').style.background = '#d04e58';
  $('progressfill').style.width = '100%';
  $('results').hidden = false;
  $('results').className = 'result error';
  setText('results', message);
}
function progress(stage) {
  const [label, percent] = stages[stage] || [stage, 5];
  setText('progress-message', label);
  setText('progress-state', `${percent}%`);
  $('progressfill').style.background = '#5d58df';
  $('progressfill').style.width = `${percent}%`;
}
function addLog(line) {
  const container = $('logs');
  if (container.querySelector('.log-placeholder')) container.replaceChildren();
  const node = document.createElement('div');
  node.className = 'log-line';
  if (/ERROR:|FAILED|STOPPED/i.test(line)) node.classList.add('error');
  else if (/WARNING|WARN/i.test(line)) node.classList.add('warn');
  else if (/SUCCESS|VERIFIED|VALIDATED|COMPLETE/i.test(line)) node.classList.add('success');
  node.textContent = line;
  container.appendChild(node);
  container.scrollTop = container.scrollHeight;
}
function setRunning(value) {
  running = !!value;
  for (const id of ['root','browse','save-root','check','preview','update','restore','backup-choice']) {
    $(id).disabled = running;
  }
  if (running) {
    $('results').hidden = true;
    setText('progress-state', 'Working');
  }
}
function renderCategories(details = []) {
  const state = new Map(details.map(c => [c.key, c]));
  const target = $('categories');
  target.replaceChildren();
  for (const item of allCategories) {
    const found = state.get(item.key);
    const row = document.createElement('div'); row.className = 'category-row';
    const name = document.createElement('span'); name.className = 'category-name'; name.textContent = item.name;
    const mapping = document.createElement('span'); mapping.className = 'category-cell'; mapping.textContent = `${item.formula}  →  ${item.value}`;
    const check = document.createElement('span'); check.className = `category-state ${found ? 'passed' : ''}`;
    check.textContent = found ? '✓' : '—';
    row.append(name, mapping, check); target.appendChild(row);
  }
  setText('category-summary', details.length ? `${details.length} / 9 passed` : 'Ready for review');
  $('category-summary').className = details.length ? 'tag' : 'tag neutral';
}
async function refreshStatus() {
  const info = await api.status();
  $('root').value = info.root;
  setText('root-short', info.root.split(/[\\/]/).filter(Boolean).slice(-2).join(' / '));
  $('root-short').title = info.root;
  $('side-dot').className = `dot ${info.connected ? 'good' : 'bad'}`;
  $('file-dot').className = `dot ${info.connected ? 'good' : 'bad'}`;
  $('health-pill').className = `status-pill ${info.connected ? '' : 'bad'}`;
  setText('health-pill', info.connected ? 'Files connected' : 'Needs attention');
  setText('side-connected', info.connected ? 'Ranking files found' : 'Check folder access');
  setText('file-check', info.connected ? 'Excel, HTML and [REP] found' : 'Required files missing');
  setText('path-error', info.error || '');
  $('path-error').hidden = !info.error;
  setText('last-html', info.connected ? `HTML modified: ${formatDate(info.htmlModified)}` : '');
  const match = /\((\d+)\)/.exec(info.nextBackup || '');
  setText('backup-next', info.connected ? `#${match ? match[1] : '—'}` : '—');
  $('backup-next').title = info.nextBackup || '';
  const chooser = $('backup-choice');
  const before = chooser.value;
  chooser.replaceChildren();
  if (!info.backups.length) {
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'No backup files found'; chooser.appendChild(empty);
  } else {
    for (const item of info.backups) {
      const opt = document.createElement('option'); opt.value = item.name;
      opt.textContent = `${item.name} · ${formatDate(item.modified)}`;
      chooser.appendChild(opt);
    }
    if (info.backups.some(b => b.name === before)) chooser.value = before;
  }
}
async function run(which, backupName) {
  if (running) return;
  setRunning(true);
  $('logs').replaceChildren();
  renderCategories();
  setText('progress-message', 'Starting...');
  $('progressfill').style.width = '3%';
  try {
    let response;
    if (which === 'preview') response = await api.preview();
    else if (which === 'update') response = await api.update();
    else response = await api.restore(backupName);
    if (!response.ok) { showError(response.error); return; }
    const result = response.result || {};
    latestResult = result;
    if (result.categories) renderCategories(result.categories);
    if (which === 'preview') $('open-preview').disabled = false;
    if (which === 'update') $('open-preview').disabled = true;
    progress('done');
    $('results').hidden = false;
    $('results').className = 'result';
    const message = which === 'preview'
      ? `Preview generated. ${result.categories?.length || 0} categories and 90 cards checked. No live files changed. Open the preview to review.`
      : which === 'update'
        ? `SUCCESS: rankspnew.html updated. Original backed up as ${result.backup}. Review HTML before manually uploading to Yahoo.`
        : `RESTORED: ${result.restored}. Your previous active HTML was saved as ${result.savedPrevious}.`;
    setText('results', message + (result.warnings?.length ? ` Warnings: ${result.warnings.join(' | ')}` : ''));
  } catch (error) { showError(error); }
  finally {
    setRunning(false);
    await refreshStatus().catch(() => {});
  }
}
async function saveRoot() {
  if (running) return;
  try {
    await api.setRoot($('root').value);
    await refreshStatus();
  } catch (e) { showError(e); }
}
function askConfirmation(action) {
  if (running) return;
  const selected = $('backup-choice').value;
  if (action === 'restore' && !selected) { showError('Please choose a numbered backup first.'); return; }
  const keyword = action === 'update' ? 'UPDATE' : 'RESTORE';
  pendingConfirm = { action, selected, keyword };
  setText('confirm-title', action === 'update' ? 'Back up & update ranking HTML?' : 'Restore selected HTML backup?');
  setText('confirm-description', action === 'update'
    ? 'Save and close Excel first. The tool creates and verifies a new numbered HTML backup before any changes. It also updates the saved Excel CODE values.'
    : `Restore ${selected} to rankspnew.html? The active file is automatically backed up first.`);
  setText('confirm-label', `Type ${keyword} to continue`);
  $('confirm-text').value = '';
  $('confirm-text').placeholder = keyword;
  $('confirm-accept').disabled = true;
  $('confirm-backdrop').hidden = false;
  $('confirm-text').focus();
}
function closeConfirm() {
  $('confirm-backdrop').hidden = true;
  pendingConfirm = null;
}
function bind() {
  $('check').addEventListener('click', () => refreshStatus().catch(showError));
  $('save-root').addEventListener('click', saveRoot);
  $('browse').addEventListener('click', async () => {
    try { const selected = await api.chooseRoot(); if (selected) { $('root').value = selected; await saveRoot(); } }
    catch (e) { showError(e); }
  });
  $('preview').addEventListener('click', () => run('preview'));
  $('update').addEventListener('click', () => askConfirmation('update'));
  $('restore').addEventListener('click', () => askConfirmation('restore'));
  $('confirm-cancel').addEventListener('click', closeConfirm);
  $('confirm-text').addEventListener('input', () => { $('confirm-accept').disabled = !pendingConfirm || $('confirm-text').value !== pendingConfirm.keyword; });
  $('confirm-text').addEventListener('keydown', event => { if (event.key === 'Escape') closeConfirm(); if (event.key === 'Enter' && !$('confirm-accept').disabled) $('confirm-accept').click(); });
  $('confirm-accept').addEventListener('click', () => {
    const pending = pendingConfirm;
    if (!pending || $('confirm-text').value !== pending.keyword) return;
    closeConfirm();
    run(pending.action, pending.selected);
  });
  $('open-preview').addEventListener('click', async () => { try { const error = await api.openPreview(); if (error) showError(error); } catch (e) { showError(e); } });
  $('open-html').addEventListener('click', async () => { try { const error = await api.openHtml(); if (error) showError(error); } catch (e) { showError(e); } });
  $('open-backups').addEventListener('click', async () => { try { const error = await api.openBackups(); if (error) showError(error); } catch (e) { showError(e); } });
  $('logs-folder').addEventListener('click', async () => { try { const error = await api.openLogs(); if (error) showError(error); } catch (e) { showError(e); } });
  api.onLog(addLog);
  api.onProgress(progress);
  api.onBusy(setRunning);
}
async function main() {
  bind();
  try {
    const init = await api.init();
    allCategories = init.categories;
    setText('version', `v${init.version}`);
    renderCategories();
    await refreshStatus();
  } catch (e) { showError(e); }
}
main();
