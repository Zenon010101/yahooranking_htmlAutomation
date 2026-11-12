'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { CATEGORIES } = require('../src/lib/categories');
const { buildHtml, locateRegions, skeleton } = require('../src/lib/html-engine');
const { backupList, backupHtml, hash } = require('../src/lib/file-ops');
const { createPreview, updateHtml, restoreBackup } = require('../src/lib/workflow');

function sampleCategory(cat) {
  const rows = Array.from({ length: 10 }, (_x, i) => ({ id: `${cat.key}-${i + 1}`, brand: `Brand ${i + 1}` }));
  const html = rows.map((row, i) =>
    ` <div class="itemdiv"><div class="boxedleft"><div class="boxedleft3"><img src="img/rank${i + 1}.png" width="100%" /></div><a target="_top" href="https://store.shopping.yahoo.co.jp/glv/${row.id}.html"><center><img src="https://item-shopping.c.yimg.jp/i/n/glv_${row.id}" width="100%" class="topimg" /><h3>${row.brand}</h3></center></a></div></div>\n`)
    .join('');
  return { key: cat.key, name: cat.name, formula: cat.formula, value: cat.value, inputRow: cat.row, rows, html };
}
function manifest() { return CATEGORIES.map(sampleCategory); }
function template({ threeKids = true } = {}) {
  let content = '<!doctype html>\n<html><head><title>Keep title</title></head><body>\n';
  for (const cat of CATEGORIES) {
    content += `<h2>${cat.name}</h2>\n${cat.markerStart}\n <div class="itemdiv">old item</div>\n`;
    if (cat.key === 'kids' && threeKids) content += `${cat.markerStart}\n <div class="itemdiv">legacy second set</div>\n`;
    content += `${cat.markerEnd}\n<div class="button1">PRESERVE ${cat.key} LINK</div>\n`;
  }
  return content + '<script>leave existing</script></body></html>\n';
}

async function tempRoot(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yr-electron-test-'));
  try { return await fn(root); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('nine CODE snippets replace only the intended comment interiors', () => {
  const original = template();
  const result = buildHtml(original, manifest());
  assert.equal(result.categories.length, 9);
  assert.equal(result.warnings.length, 1);
  assert.equal([...result.output.matchAll(/<div class="itemdiv"/g)].length, 90);
  assert.equal([...result.output.matchAll(/<!-- PASTE KIDS AND BABY HERE -->/g)].length, 2);
  assert.equal(skeleton(original, locateRegions(original).regions), skeleton(result.output, locateRegions(result.output).regions));
  assert.match(result.output, /PRESERVE kids LINK/);
  assert.match(result.output, /Keep title/);
});

test('stop immediately on missing or extra comments', () => {
  assert.throws(() => buildHtml(template().replace('<!-- PASTE BEAUTY HERE -->', '<!-- MISSING -->'), manifest()), /Beauty.*markers/i);
  assert.throws(() => buildHtml(template() + '<!-- PASTE KITCHEN HERE -->', manifest()), /Kitchen.*markers/i);
});

test('stop if IDs do not match generated code', () => {
  const bad = manifest();
  bad[0].rows[3].id = 'wrong-sku';
  assert.throws(() => buildHtml(template(), bad), /Kitchen: product link\/image mismatch at rank 4/);
});

test('backup naming always increments and originals remain identical', async () => tempRoot(async root => {
  const rep = path.join(root, '[REP]'); await fs.mkdir(rep);
  const live = path.join(root, 'rankspnew.html');
  const original = template();
  await fs.writeFile(live, original);
  await fs.writeFile(path.join(rep, 'rankspnew (24).html'), 'older file');
  const before = await hash(live);
  const backup = await backupHtml({ html: live, rep });
  assert.equal(backup.name, 'rankspnew (25).html');
  assert.equal(await hash(backup.path), before);
  assert.equal(await hash(live), before);
  const backup2 = await backupHtml({ html: live, rep });
  assert.equal(backup2.name, 'rankspnew (26).html');
  assert.equal((await backupList(rep)).length, 3);
}));

test('preview/update/restore on a fixture root: preview read-only and backup before update', async () => tempRoot(async root => {
  const appData = path.join(root, 'appdata');
  const rep = path.join(root, '[REP]'); await fs.mkdir(rep);
  const live = path.join(root, 'rankspnew.html');
  const workbook = path.join(root, 'YAHOO-RANKING COPYPASTE.xlsx');
  const original = template();
  await fs.writeFile(live, original, 'utf8');
  await fs.writeFile(workbook, Buffer.alloc(500, 42));
  await fs.writeFile(path.join(rep, 'rankspnew (24).html'), 'older');
  const origHash = await hash(live);
  const xlsxHash = await hash(workbook);
  const fakeExcel = async (_working, _folder, log) => { log?.('TEST mocked Excel extraction'); return manifest(); };
  const preview = await createPreview({ root, appData, extract: fakeExcel });
  assert.equal(preview.categories.length, 9);
  assert.equal(await hash(live), origHash);
  assert.equal((await backupList(rep)).length, 1);
  assert.match(await fs.readFile(preview.previewPath, 'utf8'), /<base href=/);
  const updated = await updateHtml({ root, appData, extract: fakeExcel });
  assert.equal(updated.backup, 'rankspnew (25).html');
  assert.equal(updated.categories.length, 9);
  assert.equal(await hash(workbook), xlsxHash);
  assert.notEqual(await hash(live), origHash);
  assert.equal([...String(await fs.readFile(live)).matchAll(/<div class="itemdiv"/g)].length, 90);
  const restored = await restoreBackup({ root, backupName: 'rankspnew (25).html' });
  assert.equal(restored.savedPrevious, 'rankspnew (26).html');
  assert.equal(await hash(live), origHash);
  assert.equal((await backupList(rep)).length, 3);
}));

test('failed Excel extraction after backup never changes active files', async () => tempRoot(async root => {
  const rep = path.join(root, '[REP]'); await fs.mkdir(rep);
  const live = path.join(root, 'rankspnew.html');
  const workbook = path.join(root, 'YAHOO-RANKING COPYPASTE.xlsx');
  await fs.writeFile(live, template());
  await fs.writeFile(workbook, Buffer.alloc(500, 52));
  const htmlBefore = await hash(live);
  const workbookBefore = await hash(workbook);
  await assert.rejects(() => updateHtml({
    root, appData: path.join(root, 'appdata'),
    extract: async () => { throw new Error('SIMULATED EXCEL FAILURE'); },
  }), /SIMULATED EXCEL FAILURE/);
  assert.equal(await hash(live), htmlBefore);
  assert.equal(await hash(workbook), workbookBefore);
  assert.equal((await backupList(rep)).length, 1);
  assert.equal((await backupList(rep))[0].name, 'rankspnew (1).html');
}));
