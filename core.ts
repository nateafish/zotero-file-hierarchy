// Pure, Zotero-independent logic for the "File Hierarchy Portable" translator.
// Everything in this module is unit-testable in Node without Zotero.
// `File Hierarchy.ts` (the Zotero adapter) imports from here and is bundled.

export const FORMAT = 'zotero-file-hierarchy-portable'
export const VERSION = 1

// ---------------------------------------------------------------------------
// Filename handling
// ---------------------------------------------------------------------------

// Characters illegal in filenames on common filesystems, mapped to their
// percent-escapes. encodeURIComponent handles most of the class, but it
// deliberately leaves `*` (like `!'()~` etc.) untouched, and `*` is illegal on
// Windows — so each matched character gets an explicit escape instead.
const ILLEGAL_FILENAME_ESCAPES: Record<string, string> = {
  '/': '%2F',
  '\\': '%5C',
  ':': '%3A',
  '*': '%2A',
  '?': '%3F',
  '"': '%22',
  '<': '%3C',
  '>': '%3E',
  '|': '%7C',
  '$': '%24',
  '%': '%25',
}

/** Replace characters that are illegal in filenames/paths with %XX escapes. */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[\x00-\x1F\x7F\/\\:*?"<>|$%]/g, char => {
    // Control characters and DEL have no printable escape name, so fall back
    // to encodeURIComponent (which does encode them).
    return ILLEGAL_FILENAME_ESCAPES[char] ?? encodeURIComponent(char)
  })
}

/** Split "base.pdf" into ["base", ".pdf"]; files without an extension return ["name", ""]. */
export function splitFilename(filename: string): [string, string] {
  const dot = filename.lastIndexOf('.')
  return dot < 1 || dot === filename.length - 1
    ? [filename, '']
    : [filename.substring(0, dot), filename.substring(dot)]
}

/** Join path segments with '/', dropping empty segments and normalizing backslashes. */
export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('/').replace(/\\/g, '/')
}

/**
 * Return `base + ext`, appending `_1`, `_2`, ... to `base` when the relative
 * path was already claimed (case-insensitively), and mark the result as used.
 */
export function resolveFilenameCollision(base: string, ext: string, used: Set<string>): string {
  let filename = `${base}${ext}`
  let postfix = 0
  while (used.has(filename.toLowerCase())) {
    filename = `${base}_${++postfix}${ext}`
  }
  used.add(filename.toLowerCase())
  return filename
}

// ---------------------------------------------------------------------------
// Collection tree -> records with hierarchical paths
// ---------------------------------------------------------------------------

export interface CollectionNode {
  key: string
  name: string
  type?: string
  children?: CollectionNode[]
}

export interface CollectionRecord {
  key: string
  name: string
  parentKey: string | null
  path: string
}

/**
 * Flatten a collection tree into records with hierarchical (sanitized) paths,
 * depth-first. The tree shape mirrors what Zotero.nextCollection() yields when
 * configOptions.getCollections is set.
 */
export function buildCollectionRecords(
  roots: CollectionNode[],
  path = '',
  parentKey: string | null = null,
): CollectionRecord[] {
  const records: CollectionRecord[] = []

  for (const node of roots) {
    const record: CollectionRecord = {
      key: node.key,
      name: node.name,
      parentKey,
      path: joinPath(path, sanitizeFilename(node.name)),
    }
    records.push(record)

    const childCollections = (node.children || []).filter(c => c.type === 'collection')
    records.push(...buildCollectionRecords(childCollections, record.path, node.key))
  }

  return records
}

// ---------------------------------------------------------------------------
// Export: manifest building
// ---------------------------------------------------------------------------

export interface AttachmentExport {
  title: string
  filename: string
  mimeType: string
  paths: string[]
}

export interface ManifestItem {
  key: string
  itemType: string
  [field: string]: unknown
}

export interface Manifest {
  format: string
  version: number
  collections: CollectionRecord[]
  items: ManifestItem[]
}

/**
 * Compute the relative path(s) each file attachment of an export item will be
 * written to — one per collection the item belongs to (PDFs are duplicated,
 * the JSON records every path; the importer only uses paths[0]). Pure: the
 * caller is responsible for actually calling attachment.saveFile().
 */
export function buildAttachmentExports(
  item: unknown,
  collectionPaths: Map<string, string>,
  usedPaths: Set<string>,
): AttachmentExport[] {
  const it = item as any
  const attachments = it.itemType === 'attachment' ? [it] : (it.attachments || [])
  const collections = (it.collections || [])
    .map((key: unknown) => collectionPaths.get(key as string))
    .filter(Boolean)
  if (!collections.length) collections.push('') // not in any collection -> root

  const exported: AttachmentExport[] = []

  for (const att of attachments) {
    if (!att.defaultPath) continue

    const [base, ext] = splitFilename(sanitizeFilename(att.filename))
    const subdir = att.contentType === 'text/html' ? base : ''
    const paths: string[] = []

    for (const coll of collections) {
      const path = joinPath(coll, subdir, base)
      paths.push(resolveFilenameCollision(path, ext, usedPaths))
    }

    exported.push({
      title: att.title || '',
      filename: att.filename || '',
      mimeType: att.mimeType || att.contentType || '',
      paths,
    })
  }

  return exported
}

export function buildManifest(items: ManifestItem[], collections: CollectionRecord[]): Manifest {
  return { format: FORMAT, version: VERSION, collections, items }
}

// ---------------------------------------------------------------------------
// Import: manifest -> import model
// ---------------------------------------------------------------------------

export interface AttachmentImport {
  title: string
  mimeType: string
  path: string
}

export interface ImportItem {
  key: string
  itemType: string
  fields: Record<string, string>
  creators: unknown[]
  tags: unknown[]
  notes: unknown[]
  attachments: AttachmentImport[]
  collectionKeys: string[]
}

export interface ImportCollection {
  key: string
  name: string
  parentKey: string | null
  itemKeys: string[]
}

export interface ImportModel {
  items: ImportItem[]
  collections: ImportCollection[]
}

/** Normalize a relative attachment path to forward slashes, dropping a leading './'. */
export function normalizeRelativePath(path: string): string {
  return String(path).replace(/\\/g, '/').replace(/^\.\//, '')
}

const SKIP_FIELDS = new Set([
  'key',
  'itemID',
  'libraryID',
  'collections',
  'attachments',
  'creators',
  'tags',
  'notes',
  'relations',
  'seeAlso',
  'dateAdded',
  'dateModified',
  'itemType',
])

/**
 * Zotero's export format emits single-field creators (organizations,
 * institutions) as `{name, creatorType}`. Zotero's import framework discards
 * any creator that has neither `firstName` nor `lastName`, which would
 * silently drop name-only creators on import. Convert them to the
 * `{fieldMode: 1, lastName}` form the framework keeps (and `cleanData` maps
 * back to a single-field creator). Multi-field creators pass through.
 */
export function normalizeCreators(creators: unknown[]): unknown[] {
  return creators.map(creator => {
    const c = creator as {
      name?: string
      firstName?: string
      lastName?: string
      creatorType?: string
    }
    if (!c || c.name === undefined || c.lastName !== undefined) return creator
    return {
      creatorType: c.creatorType,
      fieldMode: 1,
      lastName: c.name,
    }
  })
}

/** Only accept manifests written by this translator. */
export function validateManifest(data: unknown): data is Manifest {
  const d = data as any
  return Boolean(
    d &&
      d.format === FORMAT &&
      d.version === VERSION &&
      Array.isArray(d.collections) &&
      Array.isArray(d.items),
  )
}

/** Translate a validated manifest into the plain data model the import adapter applies. */
export function manifestToImportModel(manifest: Manifest): ImportModel {
  const collections: ImportCollection[] = (manifest.collections || []).map(c => ({
    key: c.key,
    name: c.name,
    parentKey: c.parentKey || null,
    itemKeys: [],
  }))
  const collectionKeys = new Set(collections.map(c => c.key))

  const items: ImportItem[] = (manifest.items || []).map((source, index) => {
    // `source` is a ManifestItem whose values are `unknown` under the index
    // signature; the fields we copy back are the unstructured export payload.
    const s = source as any
    const fields: Record<string, string> = {}
    for (const [field, value] of Object.entries(source)) {
      if (SKIP_FIELDS.has(field)) continue
      if (value === null || value === undefined) continue
      if (typeof value === 'object') continue
      fields[field] = String(value)
    }

    return {
      key: s.key || `imported-${index}`,
      itemType: s.itemType,
      fields,
      creators: normalizeCreators(s.creators || []),
      tags: s.tags || [],
      notes: s.notes || [],
      attachments: (s.attachments || [])
        .filter((att: any) => att && Array.isArray(att.paths) && att.paths.length)
        .map((att: any) => ({
          title: att.title || att.filename || '',
          mimeType: att.mimeType || '',
          path: normalizeRelativePath(att.paths[0]),
        })),
      collectionKeys: Array.isArray(s.collections)
        ? s.collections.filter((k: string) => collectionKeys.has(k))
        : [],
    }
  })

  for (const item of items) {
    for (const key of item.collectionKeys) {
      const collection = collections.find(c => c.key === key)
      if (collection) collection.itemKeys.push(item.key)
    }
  }

  return { items, collections }
}
