'use strict';
const fs = require('node:fs/promises');
const fsc = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');

const DEFAULT_ROOT = 'G:\\Shared drives\\Design Team - Local Files\\YAHOO GLV\\ranking';

function locations(root) {
  return {
    root,
    html: path.join(root, 'rankspnew.html'),
    workbook: path.join(root, 'YAHOO-RANKING COPYPASTE.xlsx'),
    rep: path.join(root, '[REP]'),
  };
}

async function hash(file) {
  const digest = crypto.createHash('sha256');
  await new Promise((resolve, reject) => {
    const input = fsc.createReadStream(file);
    input.on('data', data => digest.update(data));
    input.on('end', resolve);
    input.on('error', reject);
  });
  return digest.digest('hex');
}

async function assertFiles(root, { ignoreExcelLock = false } = {}) {
  if (typeof root !== 'string' || !root.trim()) throw new Error('Ranking folder is blank.');
  const paths = locations(path.resolve(root.trim()));
  for (const [label, file, type] of [
    ['ranking folder', paths.root, 'dir'],
    ['rankspnew.html', paths.html, 'file'],
    ['YAHOO-RANKING COPYPASTE.xlsx', paths.workbook, 'file'],
    ['[REP] folder', paths.rep, 'dir'],
  ]) {
    let stats;
    try { stats = await fs.stat(file); } catch { throw new Error(`Missing ${label}: ${file}`); }
    if (type === 'file' && (!stats.isFile() || stats.size < 100)) throw new Error(`Invalid ${label}: ${file}`);
    if (type === 'dir' && !stats.isDirectory()) throw new Error(`${label} is not a folder: ${file}`);
  }
  if (!ignoreExcelLock) {
    const lock = path.join(paths.root, '~$YAHOO-RANKING COPYPASTE.xlsx');
    try { await fs.access(lock); throw new Error('The COPYPASTE workbook seems open. Save and CLOSE Excel before running.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return paths;
}

async function backupList(rep) {
  const entries = await fs.readdir(rep, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^rankspnew\s*\((\d+)\)\.html$/i.exec(entry.name);
    if (!match) continue;
    const stats = await fs.stat(path.join(rep, entry.name));
    results.push({ name: entry.name, number: Number(match[1]), bytes: stats.size, modified: stats.mtime.toISOString() });
  }
  return results.sort((a, b) => b.number - a.number);
}

async function copyNoReplaceVerify(source, destination) {
  const before = await hash(source);
  await fs.copyFile(source, destination, fsc.constants.COPYFILE_EXCL);
  const after = await hash(destination);
  if (after !== before) throw new Error(`SHA-256 mismatch when copying ${path.basename(destination)}.`);
  return before;
}

async function backupHtml(paths, log) {
  const existing = await backupList(paths.rep);
  let next = existing.reduce((max, item) => Math.max(max, item.number), 0) + 1;
  while (true) {
    const backupPath = path.join(paths.rep, `rankspnew (${next}).html`);
    try {
      log?.(`BACKUP: Creating ${path.basename(backupPath)} BEFORE any update...`);
      const originalHash = await copyNoReplaceVerify(paths.html, backupPath);
      if (await hash(paths.html) !== originalHash) throw new Error('Live HTML changed while being backed up.');
      log?.(`BACKUP VERIFIED: ${path.basename(backupPath)} | SHA-256 ${originalHash.slice(0, 16)}...`);
      return { path: backupPath, name: path.basename(backupPath), sha256: originalHash };
    } catch (error) {
      if (error.code === 'EEXIST') { next++; continue; }
      throw error;
    }
  }
}

function decodeHtml(buffer) {
  const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
  const bytes = hasBom ? buffer.subarray(3) : buffer;
  return { html: new TextDecoder('utf-8', { fatal: true }).decode(bytes), hasBom };
}
function encodeHtml(html, hasBom) {
  const data = Buffer.from(html, 'utf8');
  return hasBom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), data]) : data;
}

async function writeAndVerify(file, bytes) {
  await fs.writeFile(file, bytes, { flag: 'wx' });
  const actual = await fs.readFile(file);
  if (!bytes.equals(actual)) throw new Error(`Staging file differs after write: ${file}`);
}

module.exports = {
  DEFAULT_ROOT, locations, hash, assertFiles, backupList, backupHtml,
  copyNoReplaceVerify, decodeHtml, encodeHtml, writeAndVerify,
};
