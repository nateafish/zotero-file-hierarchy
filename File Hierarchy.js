{
  "translatorID": "6ede6bef-0364-4a4b-86f4-dc83fb3a9bde",
  "label": "File Hierarchy Portable",
  "description": "Export files organised by collection together with portable JSON metadata that can be re-imported",
  "creator": "nathanxie (fork of Emiliano Heyns)",
  "target": "json",
  "minVersion": "5.0",
  "maxVersion": "",
  "configOptions": {
    "getCollections": true
  },
  "displayOptions": {
    "exportFileData": true,
    "exportNotes": true,
    "exportTags": true
  },
  "translatorType": 3,
  "browserSupport": "gcsv",
  "priority": 100,
  "inRepository": false,
  "lastUpdated": "2026-08-07 08:08:29"
}

var ZoteroFH = (() => {
  // core.ts
  var FORMAT = "zotero-file-hierarchy-portable";
  var VERSION = 1;
  var ILLEGAL_FILENAME_ESCAPES = {
    "/": "%2F",
    "\\": "%5C",
    ":": "%3A",
    "*": "%2A",
    "?": "%3F",
    '"': "%22",
    "<": "%3C",
    ">": "%3E",
    "|": "%7C",
    "$": "%24",
    "%": "%25"
  };
  function sanitizeFilename(filename) {
    return filename.replace(/[\x00-\x1F\x7F\/\\:*?"<>|$%]/g, (char) => {
      var _a;
      return (_a = ILLEGAL_FILENAME_ESCAPES[char]) != null ? _a : encodeURIComponent(char);
    });
  }
  function splitFilename(filename) {
    const dot = filename.lastIndexOf(".");
    return dot < 1 || dot === filename.length - 1 ? [filename, ""] : [filename.substring(0, dot), filename.substring(dot)];
  }
  function joinPath(...parts) {
    return parts.filter(Boolean).join("/").replace(/\\/g, "/");
  }
  function resolveFilenameCollision(base, ext, used) {
    let filename = `${base}${ext}`;
    let postfix = 0;
    while (used.has(filename.toLowerCase())) {
      filename = `${base}_${++postfix}${ext}`;
    }
    used.add(filename.toLowerCase());
    return filename;
  }
  function buildCollectionRecords(roots, path = "", parentKey = null) {
    const records = [];
    for (const node of roots) {
      const record = {
        key: node.key,
        name: node.name,
        parentKey,
        path: joinPath(path, sanitizeFilename(node.name))
      };
      records.push(record);
      const childCollections = (node.children || []).filter((c) => c.type === "collection");
      records.push(...buildCollectionRecords(childCollections, record.path, node.key));
    }
    return records;
  }
  function buildAttachmentExports(item, collectionPaths, usedPaths) {
    const it = item;
    const attachments = it.itemType === "attachment" ? [it] : it.attachments || [];
    const collections = (it.collections || []).map((key) => collectionPaths.get(key)).filter(Boolean);
    if (!collections.length) collections.push("");
    const exported = [];
    for (const att of attachments) {
      if (!att.defaultPath) continue;
      const [base, ext] = splitFilename(sanitizeFilename(att.filename));
      const subdir = att.contentType === "text/html" ? base : "";
      const paths = [];
      for (const coll of collections) {
        const path = joinPath(coll, subdir, base);
        paths.push(resolveFilenameCollision(path, ext, usedPaths));
      }
      exported.push({
        title: att.title || "",
        filename: att.filename || "",
        mimeType: att.mimeType || att.contentType || "",
        paths
      });
    }
    return exported;
  }
  function buildManifest(items, collections) {
    return { format: FORMAT, version: VERSION, collections, items };
  }
  function normalizeRelativePath(path) {
    return String(path).replace(/\\/g, "/").replace(/^\.\//, "");
  }
  var SKIP_FIELDS = /* @__PURE__ */ new Set([
    "key",
    "itemID",
    "libraryID",
    "collections",
    "attachments",
    "creators",
    "tags",
    "notes",
    "relations",
    "seeAlso",
    "dateAdded",
    "dateModified",
    "itemType"
  ]);
  function validateManifest(data) {
    const d = data;
    return Boolean(
      d && d.format === FORMAT && d.version === VERSION && Array.isArray(d.collections) && Array.isArray(d.items)
    );
  }
  function manifestToImportModel(manifest) {
    const collections = (manifest.collections || []).map((c) => ({
      key: c.key,
      name: c.name,
      parentKey: c.parentKey || null,
      itemKeys: []
    }));
    const collectionKeys = new Set(collections.map((c) => c.key));
    const items = (manifest.items || []).map((source, index) => {
      const s = source;
      const fields = {};
      for (const [field, value] of Object.entries(source)) {
        if (SKIP_FIELDS.has(field)) continue;
        if (value === null || value === void 0) continue;
        if (typeof value === "object") continue;
        fields[field] = String(value);
      }
      return {
        key: s.key || `imported-${index}`,
        itemType: s.itemType,
        fields,
        creators: s.creators || [],
        tags: s.tags || [],
        notes: s.notes || [],
        attachments: (s.attachments || []).filter((att) => att && Array.isArray(att.paths) && att.paths.length).map((att) => ({
          title: att.title || att.filename || "",
          mimeType: att.mimeType || "",
          path: normalizeRelativePath(att.paths[0])
        })),
        collectionKeys: Array.isArray(s.collections) ? s.collections.filter((k) => collectionKeys.has(k)) : []
      };
    });
    for (const item of items) {
      for (const key of item.collectionKeys) {
        const collection = collections.find((c) => c.key === key);
        if (collection) collection.itemKeys.push(item.key);
      }
    }
    return { items, collections };
  }

  // File Hierarchy.ts
  function debug(msg) {
    Zotero.debug(`File hierarchy portable: ${msg}`);
  }
  function collectCollectionTree() {
    const roots = [];
    let coll;
    while (coll = Zotero.nextCollection()) {
      roots.push(toCollectionNode(coll));
    }
    return roots;
  }
  function toCollectionNode(collection) {
    const primary = collection.primary ? collection.primary : collection;
    const children = collection.children || collection.descendents || [];
    return {
      key: primary.key,
      name: collection.name,
      type: collection.type || "collection",
      children: children.filter((c) => c.type === "collection").map(toCollectionNode)
    };
  }
  function saveAttachmentFiles(item, exports) {
    const attachments = item.itemType === "attachment" ? [item] : item.attachments || [];
    let i = 0;
    for (const att of attachments) {
      if (!att.defaultPath) continue;
      for (const path of exports[i++].paths) {
        debug(`saving ${path}`);
        att.saveFile(path, true);
      }
    }
  }
  function doExport() {
    if (!Zotero.getOption("exportFileData")) {
      throw new Error('File Hierarchy Portable needs "Export File Data" to be on');
    }
    const collectionRecords = buildCollectionRecords(collectCollectionTree());
    const collectionPaths = new Map(collectionRecords.map((r) => [r.key, r.path]));
    const usedPaths = /* @__PURE__ */ new Set();
    const items = [];
    let item;
    while (item = Zotero.nextItem()) {
      const data = JSON.parse(JSON.stringify(item));
      const attachmentExports = buildAttachmentExports(item, collectionPaths, usedPaths);
      data.attachments = attachmentExports;
      saveAttachmentFiles(item, attachmentExports);
      items.push(data);
    }
    Zotero.write(JSON.stringify(buildManifest(items, collectionRecords), null, 2));
  }
  function readJSON() {
    let chunk;
    let text = "";
    while ((chunk = Zotero.read(1048576)) !== false) {
      text += chunk;
    }
    return JSON.parse(text);
  }
  function detectImport() {
    try {
      return validateManifest(readJSON());
    } catch (_e) {
      return false;
    }
  }
  function doImport() {
    const data = readJSON();
    if (!validateManifest(data)) {
      throw new Error("Not a File Hierarchy Portable manifest");
    }
    const model = manifestToImportModel(data);
    const items = {};
    const collections = {};
    for (const source of model.items) {
      const item = new Zotero.Item(source.itemType);
      item.itemID = source.key;
      for (const [field, value] of Object.entries(source.fields)) {
        item[field] = value;
      }
      item.creators = source.creators;
      item.tags = source.tags;
      item.notes = source.notes;
      for (const att of source.attachments) {
        item.attachments.push({
          title: att.title,
          mimeType: att.mimeType,
          path: att.path
        });
      }
      item.complete();
      items[source.key] = item;
    }
    for (const source of model.collections) {
      const collection = new Zotero.Collection();
      collection.name = source.name;
      collection.type = "collection";
      collection.children = [];
      collections[source.key] = collection;
    }
    for (const source of model.collections) {
      const collection = collections[source.key];
      if (source.parentKey && collections[source.parentKey]) {
        collections[source.parentKey].children.push({ type: "collection", id: source.key });
      }
      for (const itemKey of source.itemKeys) {
        collection.children.push({ type: "item", id: itemKey });
      }
    }
    for (const source of model.collections) {
      collections[source.key].complete();
    }
  }
  globalThis.doExport = doExport;
  globalThis.doImport = doImport;
  globalThis.detectImport = detectImport;
})();
