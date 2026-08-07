// Mock test for File Hierarchy Portable — simulates the Zotero translator API
const fs = require('fs')

const src = fs.readFileSync('File Hierarchy.js', 'utf-8')
const body = src.replace(/^\{[\s\S]*?\}\n\n/, '')

let written = ''
let savedFiles = []

// ---- mock Zotero for EXPORT ----
const colB = { type: 'collection', key: 'BBBB', name: '方法', children: [] }
const colA = { key: 'AAAA', name: '计算传播', children: [colB] }

const attachment = {
  title: 'Full Text PDF',
  filename: 'Wang - 2025 - Example Paper.pdf',
  mimeType: 'application/pdf',
  contentType: 'application/pdf',
  defaultPath: '/zotero/storage/ABC/xxx.pdf',
  saveFile(f) { savedFiles.push(f) }
}

let exportItems = [{
  key: 'ITEM1', itemType: 'journalArticle', title: 'Example Paper',
  creators: [{ firstName: 'X', lastName: 'Wang', creatorType: 'author' }],
  tags: [{ tag: '传播学' }], notes: ['a note'],
  DOI: '10.xxxx/xxx', dateAdded: '2025-01-01 00:00:00',
  collections: ['AAAA', 'BBBB'],
  attachments: [attachment]
}]

let collQueue = [colA]

const ZoteroExport = {
  debug() {},
  getOption(o) { return o === 'exportFileData' ? true : true },
  nextCollection() { return collQueue.shift() || false },
  nextItem() { return exportItems.shift() || false },
  write(s) { written = s }
}

// ---- mock Zotero for IMPORT ----
let completedItems = []
let completedCollections = []
class MockItem {
  constructor(itemType) { this.itemType = itemType; this.attachments = []; this.creators = []; this.tags = []; this.notes = [] }
  complete() { completedItems.push(this) }
}
class MockCollection {
  constructor() { this.children = [] }
  complete() { completedCollections.push(this) }
}

// ---- load translator body ----
const api = new Function('Zotero', 'OS', body + '; return {doExport, doImport, detectImport, FORMAT, VERSION}')

console.log('--- 1. EXPORT ---')
const exp = api(ZoteroExport, {})
exp.doExport()

const manifest = JSON.parse(written)
console.log('format:', manifest.format, '| version:', manifest.version)
console.log('collections:', JSON.stringify(manifest.collections, null, 1))
console.log('saved files:', savedFiles)
const it = manifest.items[0]
console.log('item key/title:', it.key, '/', it.title)
console.log('item fields kept: DOI=%s creators=%s tags=%s', it.DOI, it.creators.length, it.tags.length)
console.log('attachment record:', JSON.stringify(it.attachments[0]))

// ---- 2. IMPORT ----
console.log('\n--- 2. IMPORT ---')
const imp = api({ read: () => false }, {})  // readJSON with no data
// feed the manifest as the file. Real Zotero runs detect and import as two
// separate passes, each starting a fresh read stream — so use separate mocks.
const jsonText = JSON.stringify(manifest)
const makeZoteroImport = () => {
  let n = 0
  return {
    read(chunk) {
      if (n++ === 0) return jsonText
      return false
    },
    Item: MockItem,
    Collection: MockCollection
  }
}
const impDetect = api(makeZoteroImport(), {})
console.log('detectImport:', impDetect.detectImport())
const imp2 = api(makeZoteroImport(), {})
imp2.doImport()

console.log('items completed:', completedItems.length)
const it2 = completedItems[0]
console.log('imported item itemID=%s title=%s DOI=%s creators=%d tags=%d notes=%d',
  it2.itemID, it2.title, it2.DOI, it2.creators.length, it2.tags.length, it2.notes.length)
console.log('imported attachment:', JSON.stringify(it2.attachments[0]))

console.log('collections completed:', completedCollections.length)
for (const c of completedCollections) {
  console.log('  collection "%s" children:', c.name, JSON.stringify(c.children))
}

// ---- 3. detectImport on garbage ----
console.log('\n--- 3. detectImport rejects non-matching JSON ---')
const imp3 = api({ read: (n) => { if (readCalls++ === 0) return JSON.stringify({ foo: 1 }); return false } }, {})
console.log('garbage detected as ours?', imp3.detectImport())
