'use strict';

// Boundaries and CODE sheet cell pairs checked against the supplied 2026-11-12 files.
// "Kids & Baby" can have an extra legacy marker INSIDE its replacement area.
const CATEGORIES = Object.freeze([
  { key: 'kitchen', name: 'Kitchen',          formula: 'J14',  value: 'J15',  row: 4,   markerStart: '<!-- PASTE KITCHEN HERE -->',             markerEnd: '<!-- PASTE KITCHEN HERE -->' },
  { key: 'home',    name: 'Home Living',      formula: 'J30',  value: 'J31',  row: 17,  markerStart: '<!-- PASTE HOME AND LIVING HERE -->',     markerEnd: '<!-- PASTE HOME AND LIVING HERE -->' },
  { key: 'travel',  name: 'Travel',           formula: 'J46',  value: 'J47',  row: 30,  markerStart: '<!-- PASTE TRAVEL HERE -->',              markerEnd: '<!-- PASTE TRAVEL -->' },
  { key: 'beauty',  name: 'Beauty',           formula: 'J62',  value: 'J63',  row: 43,  markerStart: '<!-- PASTE BEAUTY HERE -->',              markerEnd: '<!-- PASTE BEAUTY HERE -->' },
  { key: 'sports',  name: 'Sports',           formula: 'J78',  value: 'J79',  row: 56,  markerStart: '<!-- PASTE SPORTS HERE -->',              markerEnd: '<!-- PASTE SPORTS HERE -->' },
  { key: 'outdoor', name: 'Outdoor',          formula: 'J94',  value: 'J95',  row: 69,  markerStart: '<!-- PASTE OUTDOOR HERE -->',             markerEnd: '<!-- PASTE OUTDOOR HERE -->' },
  { key: 'bags',    name: 'Bags & Accessories',formula:'J110', value:'J111', row: 82,  markerStart: '<!-- PASTE BAGS & ACCESSORIES HERE -->', markerEnd: '<!-- PASTE BAGS & ACCESSORIES HERE -->' },
  { key: 'fashion', name: 'Fashion',          formula: 'J126', value: 'J127', row: 95,  markerStart: '<!-- PASTE FASHION HERE -->',             markerEnd: '<!-- PASTE FASHION HERE -->' },
  { key: 'kids',    name: 'Kids & Baby',      formula: 'J142', value: 'J143', row: 108, markerStart: '<!-- PASTE KIDS AND BABY HERE -->',       markerEnd: '<!-- PASTE KIDS AND BABY HERE -->' },
]);

module.exports = { CATEGORIES };
