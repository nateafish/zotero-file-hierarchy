const fs = require('fs')

const body = fs.readFileSync('File Hierarchy.js', 'utf-8')
const header = JSON.stringify({
  'translatorID': '6ede6bef-0364-4a4b-86f4-dc83fb3a9bde',
  'label': 'File Hierarchy Portable',
  'description': 'Export files organised by collection together with portable JSON metadata that can be re-imported',
  'creator': 'nathanxie (fork of Emiliano Heyns)',
  'target': 'json',
  'minVersion': '5.0',
  'maxVersion': '',
  'configOptions': {
    'getCollections': true
  },
  'displayOptions': {
    'exportFileData': true,
    'exportNotes': true,
    'exportTags': true
  },
  'translatorType': 3,
  'browserSupport': 'gcsv',
  'priority': 100,
  'inRepository': false,
  'lastUpdated': fs.statSync('File Hierarchy.ts').mtime.toISOString().replace('T', ' ').replace(/\..*/, ''),
}, null, 2)

fs.writeFileSync('File Hierarchy.js', header + '\n\n' + body)
