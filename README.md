# Zotero File Hierarchy Portable

Fork of [zotero-file-hierarchy](https://github.com/retorquere/zotero-file-hierarchy)。
在保留原有「按 Collection 层级导出文件夹 + PDF」功能的同时，额外导出一份可读、可再导入的
`JSON` 元数据清单。同一个 translator 同时负责**导出**和**导入**（`translatorType = 3`）。

导出结果：

```text
My Library.json          ← 完整元数据（含 Collection 树 + PDF 相对路径）
计算传播/
├── Wang - 2025 - Example Paper.pdf
└── 方法/
    └── Zhang - 2024 - Another Paper.pdf
```

## 安装

- **一键安装（推荐）**：运行 [`导出脚本/`](导出脚本/) 里的安装脚本，脚本会直接从
  GitHub 下载最新的 `File Hierarchy.js` 并安装到 Zotero 的 `translators/` 目录。
- **手动安装**：
  1. 下载 `File Hierarchy.js`
  2. 放入 Zotero 数据目录下的 `translators/` 文件夹
     （macOS 默认 `~/Zotero/translators/`；Windows 默认 `C:\Users\<用户名>\Zotero\translators\`；
     在 Zotero「设置 → 高级 → 文件和文件夹 → 显示数据目录」可查看实际路径）
  3. 重启 Zotero

## 导出

1. 右键「我的文库」或某个 Collection
2. 选择 **Export Library…** / **Export Collection…**
3. 格式选择 `File Hierarchy Portable`，勾选 **Export Files**（建议同时勾选
   Export Notes、Export Tags，以便完整恢复）
4. 选择目标位置，保存

导出目录会包含按 Collection 层级组织的 PDF 文件夹，以及一份 `My Library.json`
元数据文件。

> 注：一篇文章属于多个 Collection 时，PDF 会按原版行为复制到每个 Collection
> 目录；JSON 中的 `paths` 数组记录了全部位置，重新导入时只取第一个，不会重复导入。

## 导入

1. Zotero → **File → Import…**
2. 选择导出的 `.json` 文件
3. 保持 JSON 与附件文件夹的相对位置不变，即可恢复文献条目、Collection 层级、
   Tags、Notes 和 PDF 附件

## 开发者

源码在 `File Hierarchy.ts`，构建后生成 `File Hierarchy.js`。

```bash
npm install
npm start      # tsc 编译 + header.js 写入 translator 元数据
npm test       # 跑 mock 测试，验证导出/导入逻辑
```

修改 translator 元数据（translatorID / label / target / translatorType）在 `header.js`。

### 元数据文件格式

```json
{
  "format": "zotero-file-hierarchy-portable",
  "version": 1,
  "collections": [
    { "key": "AAAA", "name": "计算传播", "parentKey": null, "path": "计算传播" },
    { "key": "BBBB", "name": "方法", "parentKey": "AAAA", "path": "计算传播/方法" }
  ],
  "items": [
    {
      "key": "ITEM1",
      "itemType": "journalArticle",
      "title": "Example Paper",
      "creators": [],
      "date": "2025",
      "DOI": "10.xxxx/xxx",
      "tags": [],
      "notes": [],
      "collections": ["AAAA", "BBBB"],
      "attachments": [
        {
          "title": "Full Text PDF",
          "filename": "Wang - 2025 - Example Paper.pdf",
          "mimeType": "application/pdf",
          "paths": [
            "计算传播/Wang - 2025 - Example Paper.pdf",
            "计算传播/方法/Wang - 2025 - Example Paper.pdf"
          ]
        }
      ]
    }
  ]
}
```

`paths` 记录一篇论文在所有 Collection 下的导出位置；重新导入时只取 `paths[0]`
作为附件来源，再根据 `collections` 数组把条目加入多个 Collection。
