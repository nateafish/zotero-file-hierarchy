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
  "lastUpdated": "2026-08-07 07:42:22"
}

function debug(msg) {
    Zotero.debug(`File hierarchy portable: ${msg}`);
}
const FORMAT = 'zotero-file-hierarchy-portable';
const VERSION = 1;
class Collections {
    constructor() {
        this.path = {};
        this.saved = {};
        this.records = [];
        let coll;
        while (coll = Zotero.nextCollection()) {
            this.register(coll);
        }
        debug('collections: ' + JSON.stringify(this.path));
    }
    join(...p) {
        return p.filter(_ => _).join('/');
    }
    register(collection, path, parentKey) {
        const key = (collection.primary ? collection.primary : collection).key;
        const children = collection.children || collection.descendents || [];
        const collections = children.filter(coll => coll.type === 'collection');
        const name = collection.name;
        this.path[key] = this.join(path, this.clean(name));
        this.records.push({
            key,
            name,
            parentKey,
            path: this.path[key]
        });
        for (const coll of collections) {
            this.register(coll, this.path[key], key);
        }
    }
    clean(filename) {
        return filename.replace(/[\x00-\x1F\x7F\/\\:*?"<>|$%]/g, encodeURIComponent);
    }
    split(filename) {
        const dot = filename.lastIndexOf('.');
        return (dot < 1 || dot === (filename.length - 1)) ? [filename, ''] : [filename.substring(0, dot), filename.substring(dot)];
    }
    save(item) {
        const exported = [];
        const attachments = (item.itemType === 'attachment') ? [item] : (item.attachments || []);
        let collections = (item.collections || []).map(key => this.path[key]).filter(coll => coll);
        if (!collections.length)
            collections = ['']; // if the item is not in a collection, save it in the root.
        for (const att of attachments) {
            if (!att.defaultPath)
                continue;
            const [base, ext] = this.split(this.clean(att.filename));
            const subdir = att.contentType === 'text/html' ? base : '';
            const paths = [];
            for (const coll of collections) {
                const path = this.join(coll, subdir, base);
                let filename = `${path}${ext}`;
                let postfix = 0;
                while (this.saved[filename.toLowerCase()]) {
                    filename = `${path}_${++postfix}${ext}`;
                }
                this.saved[filename.toLowerCase()] = true;
                debug(JSON.stringify(filename));
                att.saveFile(filename, true);
                paths.push(filename);
            }
            exported.push({
                title: att.title || '',
                filename: att.filename || '',
                mimeType: att.mimeType || att.contentType || '',
                paths
            });
        }
        return exported;
    }
}
function doExport() {
    if (!Zotero.getOption('exportFileData'))
        throw new Error('File Hierarchy Portable needs "Export File Data" to be on');
    const collections = new Collections;
    const manifest = {
        format: FORMAT,
        version: VERSION,
        collections: collections.records,
        items: []
    };
    let item;
    while ((item = Zotero.nextItem())) {
        const data = JSON.parse(JSON.stringify(item));
        data.attachments = collections.save(item);
        manifest.items.push(data);
    }
    Zotero.write(JSON.stringify(manifest, null, 2));
}
function readJSON() {
    let chunk;
    let text = '';
    while ((chunk = Zotero.read(1048576)) !== false) {
        text += chunk;
    }
    return JSON.parse(text);
}
function detectImport() {
    try {
        const data = readJSON();
        return data
            && data.format === FORMAT
            && data.version === VERSION
            && Array.isArray(data.items);
    }
    catch (e) {
        return false;
    }
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
    'dateModified'
]);
function doImport() {
    const data = readJSON();
    const items = {};
    const collections = {};
    // 1. Create every collection first, so item->collection wiring can reference them
    for (const source of data.collections || []) {
        const collection = new Zotero.Collection();
        collection.name = source.name;
        collection.type = 'collection';
        collection.children = [];
        collections[source.key] = collection;
    }
    // 2. Import items
    for (const source of data.items) {
        const item = new Zotero.Item(source.itemType);
        // Use the original Zotero key as a temporary id so collections can reference it
        item.itemID = source.key;
        for (const [field, value] of Object.entries(source)) {
            if (SKIP_FIELDS.has(field))
                continue;
            if (value === null || value === undefined)
                continue;
            if (typeof value === 'object')
                continue;
            item[field] = value;
        }
        item.creators = source.creators || [];
        item.tags = source.tags || [];
        item.notes = source.notes || [];
        // Restore attachments by the first exported path (relative to the JSON file)
        for (const att of source.attachments || []) {
            if (!att.paths || !att.paths.length)
                continue;
            item.attachments.push({
                title: att.title || att.filename,
                mimeType: att.mimeType,
                path: att.paths[0]
            });
        }
        item.complete();
        items[source.key] = item;
    }
    // 3. Restore collection hierarchy and item membership
    for (const source of data.collections || []) {
        const collection = collections[source.key];
        if (source.parentKey && collections[source.parentKey]) {
            collections[source.parentKey].children.push({ type: 'collection', id: source.key });
        }
        for (const itemSource of data.items) {
            if (Array.isArray(itemSource.collections) && itemSource.collections.includes(source.key)) {
                collection.children.push({ type: 'item', id: itemSource.key });
            }
        }
    }
    // 4. Finalise collections
    for (const source of data.collections || []) {
        collections[source.key].complete();
    }
}
