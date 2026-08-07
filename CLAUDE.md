# Testing requirements

任何涉及 import/export、collection、attachment path 或 manifest
格式的修改完成后，必须运行：

npm test
npm run lint
npm run build

不得以“代码看起来正确”代替运行测试。

测试失败时应分析失败原因并修复，再重新运行全部测试。

## Round-trip invariant

export -> manifest -> import 后必须保持：

- bibliographic metadata
- creators
- tags
- notes
- collection hierarchy
- collection membership
- attachment count
- attachment relative paths

不要求保持 Zotero internal item key。

## Zotero-specific limitations

Node 测试不得伪装成已经验证真实 Zotero API。
凡是涉及 Zotero.Item.complete()、Zotero.Collection.complete()、
attachment saveFile()、真实 importer 路径解析的行为，必须明确标记
为 Zotero integration test。
