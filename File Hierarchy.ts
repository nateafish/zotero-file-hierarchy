declare const Zotero: any

import {
  buildAttachmentExports,
  buildCollectionRecords,
  buildManifest,
  manifestToImportModel,
  validateManifest,
  type AttachmentExport,
  type CollectionNode,
  type ManifestItem,
} from './core'

function debug(msg: string) {
  Zotero.debug(`File hierarchy portable: ${msg}`)
}

// ---------------------------------------------------------------------------
// Zotero -> pure data (export side)
// ---------------------------------------------------------------------------

/** Turn Zotero.nextCollection() output into the plain tree buildCollectionRecords expects. */
function collectCollectionTree(): CollectionNode[] {
  const roots: CollectionNode[] = []
  let coll: any
  while ((coll = Zotero.nextCollection())) {
    roots.push(toCollectionNode(coll))
  }
  return roots
}

function toCollectionNode(collection: any): CollectionNode {
  const primary = collection.primary ? collection.primary : collection
  const children = collection.children || collection.descendents || []
  return {
    key: primary.key,
    name: collection.name,
    type: collection.type || 'collection',
    children: children.filter((c: any) => c.type === 'collection').map(toCollectionNode),
  }
}

/**
 * Actually write the exported files. `buildAttachmentExports` computed the
 * plan in the same attachment order, so the two iterators stay in lockstep.
 */
function saveAttachmentFiles(item: any, exports: AttachmentExport[]): void {
  const attachments = item.itemType === 'attachment' ? [item] : (item.attachments || [])
  let i = 0
  for (const att of attachments) {
    if (!att.defaultPath) continue
    for (const path of exports[i++].paths) {
      debug(`saving ${path}`)
      att.saveFile(path, true)
    }
  }
}

function doExport(): void {
  if (!Zotero.getOption('exportFileData')) {
    throw new Error('File Hierarchy Portable needs "Export File Data" to be on')
  }

  const collectionRecords = buildCollectionRecords(collectCollectionTree())
  const collectionPaths = new Map(collectionRecords.map(r => [r.key, r.path]))
  const usedPaths = new Set<string>()
  const items: ManifestItem[] = []

  let item: any
  while ((item = Zotero.nextItem())) {
    const data: ManifestItem = JSON.parse(JSON.stringify(item))
    const attachmentExports = buildAttachmentExports(item, collectionPaths, usedPaths)
    data.attachments = attachmentExports
    saveAttachmentFiles(item, attachmentExports)
    items.push(data)
  }

  Zotero.write(JSON.stringify(buildManifest(items, collectionRecords), null, 2))
}

// ---------------------------------------------------------------------------
// Pure data -> Zotero (import side)
// ---------------------------------------------------------------------------

function readJSON(): any {
  let chunk: string | false
  let text = ''
  while ((chunk = Zotero.read(1048576)) !== false) {
    text += chunk
  }
  return JSON.parse(text)
}

function detectImport(): boolean {
  try {
    return validateManifest(readJSON())
  } catch (_e) {
    return false
  }
}

function doImport(): void {
  const data = readJSON()
  if (!validateManifest(data)) {
    throw new Error('Not a File Hierarchy Portable manifest')
  }

  const model = manifestToImportModel(data)
  const items: Record<string, any> = {}
  const collections: Record<string, any> = {}

  for (const source of model.items) {
    const item = new Zotero.Item(source.itemType)
    item.itemID = source.key
    for (const [field, value] of Object.entries(source.fields)) {
      item[field] = value
    }
    item.creators = source.creators
    item.tags = source.tags
    item.notes = source.notes
    for (const att of source.attachments) {
      item.attachments.push({
        title: att.title,
        mimeType: att.mimeType,
        path: att.path,
      })
    }
    item.complete()
    items[source.key] = item
  }

  for (const source of model.collections) {
    const collection = new Zotero.Collection()
    collection.name = source.name
    collection.type = 'collection'
    collection.children = []
    collections[source.key] = collection
  }

  for (const source of model.collections) {
    const collection = collections[source.key]
    if (source.parentKey && collections[source.parentKey]) {
      collections[source.parentKey].children.push({ type: 'collection', id: source.key })
    }
    for (const itemKey of source.itemKeys) {
      collection.children.push({ type: 'item', id: itemKey })
    }
  }

  for (const source of model.collections) {
    collections[source.key].complete()
  }
}

// The esbuild bundle wraps this file in an IIFE, so expose the entry points the
// Zotero translator framework looks up as explicit globals.
// (Explicit semicolons are required — without them the following "(globalThis"
// line is parsed by ASI as an argument list of a call to doExport/doImport.)
;(globalThis as any).doExport = doExport
;(globalThis as any).doImport = doImport
;(globalThis as any).detectImport = detectImport
