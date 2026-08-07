// Verify the built File Hierarchy.js: metadata block is valid, required fields
// are present, translatorType is 3 (import + export), and the body parses and
// contains the entry points Zotero looks up.
import { readFileSync } from 'node:fs'

const src = readFileSync('File Hierarchy.js', 'utf-8')
const m = src.match(/^\{[\s\S]*?\}\n\n/)
if (!m) throw new Error('File Hierarchy.js: no JSON header found')
const header = JSON.parse(m[0])
const body = src.slice(m[0].length)

const required = [
  'translatorID', 'label', 'description', 'creator', 'target', 'minVersion',
  'maxVersion', 'configOptions', 'displayOptions', 'translatorType',
  'browserSupport', 'priority', 'inRepository', 'lastUpdated',
]
for (const key of required) {
  if (!(key in header)) throw new Error(`metadata missing required field: ${key}`)
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(header.translatorID)) {
  throw new Error(`translatorID is not a valid UUID: ${header.translatorID}`)
}
if ((header.translatorType & 1) === 0 || (header.translatorType & 2) === 0) {
  throw new Error(`translatorType must support both import (1) and export (2); got ${header.translatorType}`)
}
if (!header.target) throw new Error('target must not be empty')
if (header.translatorID === '86ffd88b-6f4e-4bec-a5be-839c1034beb2') {
  throw new Error('translatorID still matches the upstream File Hierarchy; replace it')
}

for (const fn of ['doExport', 'doImport', 'detectImport']) {
  if (!body.includes(fn)) throw new Error(`body missing entry point: ${fn}`)
}

new Function(body) // syntax check (header stripped); Zotero globals only at call time

console.log(`OK: translator metadata + body valid (${body.length} bytes of code)`)
