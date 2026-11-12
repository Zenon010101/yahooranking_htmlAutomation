'use strict';

const fs = require('node:fs/promises');
const fsc = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');
const { buildHtml, locateRegions } = require('./html-engine');
const {
  assertFiles, backupList, backupHtml, copyNoReplaceVerify,
  decodeHtml, encodeHtml, hash, writeAndVerify,
} = require('./file-ops');

const execute = promisify(execFile);
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}
function nonce() { return Math.random().toString(16).slice(2, 10); }

async function excelExtract(workbookCopy, workDir, log) {
  // main.js selects the correct script: source tree in development, extraResources in EXE.
  const helper = process.env.YR_SCRIPT_PATH || path.join(__dirname, '../../scripts/Extract-CODE.ps1');
  const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', helper, '-Workbook', workbookCopy, '-OutputDirectory', workDir];
  log?.('Excel: calculating CODE formulas and Paste Special -> Values & Number Formats on a PRIVATE copy.');
  let output;
  try {
    output = await execute('powershell.exe', args, {
      windowsHide: true, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024,
    });
  } catch (err) {
    const message = [err.message, err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Excel processing failed. Check that Microsoft Excel is installed and workbook is saved/closed.\n${message.slice(0, 2600)}`);
  }
  for (const line of String(output.stdout || '').split(/\r?\n/).filter(Boolean)) log?.(`Excel: ${line.trim()}`);
  let content;
  try { content = await fs.readFile(path.join(workDir, 'manifest.json'), 'utf8'); }
  catch { throw new Error('Excel helper did not write manifest.json.'); }
  let manifest;
  try { manifest = JSON.parse(content.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Excel helper produced invalid JSON.'); }
  if (!Array.isArray(manifest) || manifest.length !== 9) throw new Error('Excel helper did not produce all nine CODE sections.');
  return manifest;
}

function previewHtml(content, root) {
  // Preview ONLY: add a base URL for relative css/ and img/ resources.
  // Never insert this extra tag into the live rankspnew.html.
  const rootHref = pathToFileURL(path.join(root, path.sep)).href;
  const tag = `<base href="${rootHref}">`;
  if (!/<\/head\s*>/i.test(content)) throw new Error('HTML preview is missing </head>.');
  return content.replace(/<\/head\s*>/i, `  ${tag}\n  </head>`);
}

function addWarnings(html, warnings) {
  const matches = [...html.matchAll(/\bid=["']([^"']+)["']/g)];
  const found = new Set();
  const dup = new Set();
  for (const m of matches) {
    if (found.has(m[1])) dup.add(m[1]); else found.add(m[1]);
  }
  if (dup.size) warnings.push(`Existing HTML has duplicate heading/element IDs (${[...dup].join(', ')}). Not modified because it is outside ranking comments.`);
}

async function prepareWorking(paths, originalHtmlHash, originalExcelHash, log, extract) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'yahoo-ranking-electron-'));
  try {
    const privateXlsx = path.join(workspace, 'YAHOO-RANKING COPYPASTE.xlsx');
    await fs.copyFile(paths.workbook, privateXlsx, fsc.constants.COPYFILE_EXCL);
    if (await hash(privateXlsx) !== originalExcelHash) throw new Error('Excel changed during private working-copy creation.');
    const manifest = await extract(privateXlsx, workspace, log);
    const originalBytes = await fs.readFile(paths.html);
    if (await hash(paths.html) !== originalHtmlHash) throw new Error('Live HTML changed during processing.');
    const decoded = decodeHtml(originalBytes);
    const result = buildHtml(decoded.html, manifest);
    addWarnings(result.output, result.warnings);
    const newBytes = encodeHtml(result.output, decoded.hasBom);
    const htmlOut = path.join(workspace, 'rankspnew_generated.html');
    await writeAndVerify(htmlOut, newBytes);
    const readBack = decodeHtml(await fs.readFile(htmlOut));
    if (readBack.html !== result.output) throw new Error('Generated HTML failed read-back verification.');
    log?.(`VALIDATED 9 categories, 90 product cards, ${result.changed} replaced blocks; outside-comment HTML unchanged.`);
    for (const warning of result.warnings) log?.(`WARNING: ${warning}`);
    return { ...result, workspace, privateXlsx, htmlOut, htmlBytes: newBytes };
  } catch (error) {
    await fs.rm(workspace, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function createPreview({ root, appData, log, progress, extract = excelExtract }) {
  const paths = await assertFiles(root);
  progress?.('read');
  const originalHtmlHash = await hash(paths.html);
  const originalExcelHash = await hash(paths.workbook);
  log?.('PREVIEW ONLY: live workbook and HTML will NOT be changed.');
  progress?.('excel');
  const prepared = await prepareWorking(paths, originalHtmlHash, originalExcelHash, log, extract);
  try {
    progress?.('validate');
    const previews = path.join(appData, 'previews');
    await fs.mkdir(previews, { recursive: true });
    const draft = path.join(previews, `rankspnew_preview_${nowStamp()}_${nonce()}.html`);
    await writeAndVerify(draft, Buffer.from(previewHtml(prepared.output, paths.root), 'utf8'));
    log?.(`PREVIEW READY: ${draft}`);
    return {
      mode: 'preview', previewPath: draft, changed: prepared.changed,
      categories: prepared.categories, warnings: prepared.warnings,
    };
  } finally {
    await fs.rm(prepared.workspace, { recursive: true, force: true }).catch(() => {});
  }
}

async function updateHtml({ root, appData, log, progress, extract = excelExtract }) {
  const paths = await assertFiles(root);
  const originalHtmlHash = await hash(paths.html);
  const originalExcelHash = await hash(paths.workbook);
  progress?.('backup');
  const htmlBackup = await backupHtml(paths, log); // MANDATORY first write operation.
  if (htmlBackup.sha256 !== originalHtmlHash) throw new Error('HTML changed during required backup. Stopped.');
  const persistentDir = path.join(appData, 'excel-backups');
  await fs.mkdir(persistentDir, { recursive: true });
  const excelBackup = path.join(persistentDir, `COPYPASTE_preupdate_${nowStamp()}_${nonce()}.xlsx`);
  await copyNoReplaceVerify(paths.workbook, excelBackup);
  if (await hash(paths.workbook) !== originalExcelHash) throw new Error('Workbook changed while being backed up. Stopped.');
  log?.(`WORKBOOK BACKUP VERIFIED (local): ${excelBackup}`);
  progress?.('excel');
  let prepared;
  try {
    prepared = await prepareWorking(paths, originalHtmlHash, originalExcelHash, log, extract);
    progress?.('validate');
    const stagedExcel = path.join(paths.root, `.yahoo_rank_workbook_${nonce()}.xlsx`);
    const stagedHtml = path.join(paths.root, `.yahoo_rank_html_${nonce()}.html`);
    let excelTouched = false, htmlTouched = false;
    try {
      // Stage and verify both outputs on G: BEFORE touching active files.
      await fs.copyFile(prepared.privateXlsx, stagedExcel, fsc.constants.COPYFILE_EXCL);
      if (await hash(stagedExcel) !== await hash(prepared.privateXlsx)) throw new Error('Workbook staging hash mismatch on G:.');
      await writeAndVerify(stagedHtml, prepared.htmlBytes);
      if (await hash(paths.html) !== originalHtmlHash || await hash(paths.workbook) !== originalExcelHash) {
        throw new Error('Live Excel or HTML changed during generation. Stopping without overwriting it.');
      }
      progress?.('commit');
      log?.('COMMIT: Saving refreshed CODE values to live COPYPASTE workbook.');
      excelTouched = true;
      await fs.copyFile(stagedExcel, paths.workbook);
      if (await hash(paths.workbook) !== await hash(stagedExcel)) throw new Error('Workbook verification failed after commit.');
      log?.('COMMIT: Updating only marked ranking sections in rankspnew.html.');
      htmlTouched = true;
      await fs.copyFile(stagedHtml, paths.html);
      if (await hash(paths.html) !== await hash(stagedHtml)) throw new Error('HTML verification failed after commit.');
      progress?.('done');
      log?.(`SUCCESS. Live files updated. HTML backup: ${htmlBackup.name}. Yahoo upload remains MANUAL.`);
      return {
        mode: 'update', backup: htmlBackup.name, backupPath: htmlBackup.path,
        changed: prepared.changed, categories: prepared.categories, warnings: prepared.warnings,
        excelBackup,
      };
    } catch (error) {
      // Compensating rollback. The durable backups remain available even if rollback fails.
      log?.(`ERROR: ${error.message}. Rolling back any committed files...`);
      const rollbackErrors = [];
      if (htmlTouched) {
        try {
          await fs.copyFile(htmlBackup.path, paths.html);
          if (await hash(paths.html) !== originalHtmlHash) throw new Error('HTML rollback hash mismatch');
          log?.('ROLLBACK: HTML restored from [REP].');
        } catch (restoreError) { rollbackErrors.push(`HTML: ${restoreError.message}`); }
      }
      if (excelTouched) {
        try {
          await fs.copyFile(excelBackup, paths.workbook);
          if (await hash(paths.workbook) !== originalExcelHash) throw new Error('Excel rollback hash mismatch');
          log?.('ROLLBACK: original Excel workbook restored.');
        } catch (restoreError) { rollbackErrors.push(`Excel: ${restoreError.message}`); }
      }
      if (rollbackErrors.length) {
        throw new Error(`MANUAL RECOVERY REQUIRED. ${error.message}. ${rollbackErrors.join(' | ')}. HTML backup: ${htmlBackup.path}. Excel backup: ${excelBackup}`);
      }
      throw error;
    } finally {
      await fs.rm(stagedExcel, { force: true }).catch(() => {});
      await fs.rm(stagedHtml, { force: true }).catch(() => {});
    }
  } finally {
    if (prepared?.workspace) await fs.rm(prepared.workspace, { recursive: true, force: true }).catch(() => {});
  }
}

async function restoreBackup({ root, backupName, log, progress }) {
  const paths = await assertFiles(root, { ignoreExcelLock: true });
  const list = await backupList(paths.rep);
  const chosen = list.find(item => item.name === backupName);
  if (!chosen) throw new Error('The selected backup was not found in [REP].');
  const candidate = path.join(paths.rep, chosen.name);
  const selectedBytes = await fs.readFile(candidate);
  const selectedContent = decodeHtml(selectedBytes).html;
  locateRegions(selectedContent); // Refuse to restore a corrupt/incorrect HTML file.
  const sourceHash = await hash(candidate);
  progress?.('backup');
  const safetyBackup = await backupHtml(paths, log); // Back up CURRENT active HTML before restore.
  if (await hash(candidate) !== sourceHash) throw new Error('Selected backup changed during preparation.');
  const currentHash = safetyBackup.sha256;
  progress?.('commit');
  try {
    await fs.copyFile(candidate, paths.html);
    if (await hash(paths.html) !== sourceHash) throw new Error('Restored HTML failed SHA-256 verification.');
    log?.(`RESTORED ${chosen.name}. Replaced live HTML; prior current HTML saved as ${safetyBackup.name}.`);
    progress?.('done');
    return { mode: 'restore', restored: chosen.name, savedPrevious: safetyBackup.name };
  } catch (err) {
    try {
      await fs.copyFile(safetyBackup.path, paths.html);
      if (await hash(paths.html) !== currentHash) throw new Error('rollback SHA-256 mismatch');
      log?.('RESTORE ROLLBACK: previous current HTML recovered.');
    } catch (rollbackError) {
      throw new Error(`RESTORE FAILED; MANUAL RECOVERY REQUIRED: ${rollbackError.message}. Safety backup at ${safetyBackup.path}`);
    }
    throw err;
  }
}

module.exports = { excelExtract, createPreview, updateHtml, restoreBackup, previewHtml };
