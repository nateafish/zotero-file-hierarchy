# 导出脚本

把 Zotero 的 Collection 导出为可读目录时需要用到的安装脚本。

| 文件 | 说明 |
|---|---|
| `install-mac.sh` | macOS / Linux 一键安装脚本 |
| `install-windows.bat` | Windows 一键安装脚本 |

脚本会**直接从 GitHub 下载本仓库最新构建的 `File Hierarchy.js`**，并安装到
Zotero 数据目录下的 `translators/` 文件夹，无需手动放文件。

## 用法（一次执行）

- **macOS**：终端执行

  ```bash
  curl -fsSL "https://raw.githubusercontent.com/nateafish/zotero-file-hierarchy/master/导出脚本/install-mac.sh" -o /tmp/install-fh.sh && bash /tmp/install-fh.sh
  ```

  自定义数据目录：`ZOTERO_DATA=/你的/实际路径 bash install-mac.sh`

- **Windows**：下载 `install-windows.bat` 后双击运行（或命令行执行）。脚本使用
  Windows 10/11 自带的 `curl.exe`。自定义数据目录：先 `set ZOTERO_DATA=你的路径`。

## 手动安装

1. 下载 `File Hierarchy.js`：<https://raw.githubusercontent.com/nateafish/zotero-file-hierarchy/master/File%20Hierarchy.js>
2. 放入 Zotero 数据目录下的 `translators/` 文件夹
   - macOS 默认：`~/Zotero/translators/`；Windows 默认：`C:\Users\<用户名>\Zotero\translators\`
   - 在 Zotero「设置 → 高级 → 文件和文件夹 → 显示数据目录」可查看实际路径
3. 重启 Zotero
4. 选中 Collection → 文件 → 导出 → 格式选 **File Hierarchy Portable** → 勾选 **Export Files**
