'use strict';

const { CATEGORIES } = require('./categories');

function occurrences(text, needle) {
  const positions = [];
  let at = 0;
  while (true) {
    const found = text.indexOf(needle, at);
    if (found === -1) break;
    positions.push(found);
    at = found + needle.length;
  }
  return positions;
}

function locateRegions(html) {
  if (!/<html\b/i.test(html) || !/<\/html\s*>/i.test(html)) throw new Error('rankspnew.html is missing its HTML document tags.');
  const regions = [];
  const warnings = [];
  for (const category of CATEGORIES) {
    const starts = occurrences(html, category.markerStart);
    let from, to;
    if (category.markerStart === category.markerEnd) {
      const allowed = category.key === 'kids' ? [2, 3] : [2];
      if (!allowed.includes(starts.length)) {
        throw new Error(`${category.name}: expected ${allowed.join(' or ')} matching comment markers, found ${starts.length}. No files changed.`);
      }
      from = starts[0] + category.markerStart.length;
      to = starts[starts.length - 1];
      if (category.key === 'kids' && starts.length === 3) {
        warnings.push('Kids & Baby has three legacy comments: replacement runs from the FIRST to LAST, so the duplicate middle block is inside the editable area.');
      }
    } else {
      const ends = occurrences(html, category.markerEnd);
      if (starts.length !== 1 || ends.length !== 1) {
        throw new Error(`${category.name}: expected one start and one end comment, found ${starts.length}/${ends.length}.`);
      }
      from = starts[0] + category.markerStart.length;
      to = ends[0];
    }
    if (from >= to) throw new Error(`${category.name}: invalid comment order or empty marker region.`);
    regions.push({ category, from, to });
  }
  regions.sort((a, b) => a.from - b.from);
  for (let i = 1; i < regions.length; i++) {
    if (regions[i - 1].to >= regions[i].from) throw new Error('HTML ranking comment regions overlap.');
  }
  if (regions.length !== 9) throw new Error('Expected nine category regions.');
  return { regions, warnings };
}

function skeleton(html, regions) {
  let out = '';
  let pos = 0;
  for (let i = 0; i < regions.length; i++) {
    const r = regions[i];
    out += html.slice(pos, r.from) + `[[YAHOO_RANKING_SLOT_${i}]]`;
    pos = r.to;
  }
  return out + html.slice(pos);
}

function decodeEntities(text) {
  return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, token => ({
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' '
  })[token] || token);
}

function validateCode(category, html, rows) {
  if (typeof html !== 'string' || html.length < 1000 || html.length > 32767) {
    throw new Error(`${category.name}: CODE!${category.value} is blank or unexpectedly long/short.`);
  }
  if (/<\s*(?:script|iframe|style)\b|\bon\w+\s*=/i.test(html)) {
    throw new Error(`${category.name}: executable or unexpected markup found in ranking code.`);
  }
  if (!Array.isArray(rows) || rows.length !== 10) throw new Error(`${category.name}: expected 10 ID/brand pairs from 0722update.`);
  const cards = [...html.matchAll(/<div\s+class=["']itemdiv["']/gi)];
  const links = [...html.matchAll(/https:\/\/store\.shopping\.yahoo\.co\.jp\/glv\/([^"'<>\s]+)\.html/gi)];
  const images = [...html.matchAll(/https:\/\/item-shopping\.c\.yimg\.jp\/i\/n\/glv_([^"'<>\s]+)/gi)];
  const brands = [...html.matchAll(/<h3>([^<>]*)<\/h3>/gi)];
  const ranking = [...html.matchAll(/img\/rank(\d+)\.png/gi)];
  const counts = [cards.length, links.length, images.length, brands.length, ranking.length];
  if (counts.some(n => n !== 10)) {
    throw new Error(`${category.name}: expected 10 cards/links/images/brand names/rank icons; got ${counts.join('/')}.`);
  }
  for (let i = 0; i < 10; i++) {
    const data = rows[i] || {};
    const id = String(data.id ?? '').trim().toLowerCase();
    const brand = String(data.brand ?? '').trim();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`${category.name}: invalid product ID at rank ${i + 1}.`);
    if (!brand || /[<>]/.test(brand)) throw new Error(`${category.name}: invalid brand at rank ${i + 1}.`);
    if (links[i][1].toLowerCase() !== id || images[i][1].toLowerCase() !== id) {
      throw new Error(`${category.name}: product link/image mismatch at rank ${i + 1}; expected ${id}.`);
    }
    if (decodeEntities(brands[i][1].trim()) !== brand) {
      throw new Error(`${category.name}: brand mismatch at rank ${i + 1}; expected '${brand}'.`);
    }
    if (Number(ranking[i][1]) !== i + 1) throw new Error(`${category.name}: incorrect rank icon at rank ${i + 1}.`);
  }
  return { key: category.key, name: category.name, count: cards.length, characters: html.length };
}

function buildHtml(original, manifest) {
  const before = locateRegions(original);
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const byKey = new Map((manifest || []).map(item => [item.key, item]));
  const details = [];
  let updated = '';
  let pos = 0;
  let changed = 0;
  for (const region of before.regions) {
    const cat = region.category;
    const input = byKey.get(cat.key);
    if (!input) throw new Error(`Missing generated CODE value for ${cat.name}.`);
    if (input.formula !== cat.formula || input.value !== cat.value || Number(input.inputRow) !== cat.row) {
      throw new Error(`${cat.name}: Excel cell mapping did not match the verified template.`);
    }
    details.push(validateCode(cat, input.html, input.rows));
    const old = original.slice(region.from, region.to);
    const lead = /^\s*/.exec(old)[0];
    const tail = /\s*$/.exec(old)[0];
    const code = input.html.replace(/\r\n|\r|\n/g, '\n').trim().replace(/\n/g, newline);
    const replacement = lead + code + tail;
    updated += original.slice(pos, region.from) + replacement;
    if (replacement !== old) changed++;
    pos = region.to;
  }
  updated += original.slice(pos);
  const after = locateRegions(updated);
  if (skeleton(original, before.regions) !== skeleton(updated, after.regions)) {
    throw new Error('Outside-region safety check FAILED: HTML outside the comment sections changed.');
  }
  for (const r of after.regions) {
    const count = [...updated.slice(r.from, r.to).matchAll(/<div\s+class=["']itemdiv["']/gi)].length;
    if (count !== 10) throw new Error(`${r.category.name}: output has ${count} items, expected 10.`);
  }
  return { output: updated, changed, categories: details, warnings: before.warnings };
}

module.exports = { locateRegions, skeleton, validateCode, buildHtml };
