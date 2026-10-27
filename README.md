# 电商图片下载助手

一键抓取电商商品详情页的全部图片，在新页面集中预览，支持**单张下载 PNG**、**多张打包 ZIP**。

## 功能

- 🖼️ **全量抓取**：自动识别 `img`、懒加载属性（`data-src` / `data-original` 等）、`srcset` 与 CSS 背景图，不遗漏高清原图。
- 🗂️ **集中预览**：新标签页网格展示所有图片，支持全选、反选、清空。
- ⬇️ **单张下载**：悬停单图即可单独下载，文件名自动整理。
- 📦 **批量打包**：勾选多张或全部图片，一键打包为 ZIP 压缩包。
- 🔓 **跨域 / 防盗链**：后台读取 + 无 Referer 请求，绕过常见 CDN 防盗链。

## 目录结构

```
.
├── 需求分析.md                  # 需求分析与 AI 提示词（含迭代记录）
├── ecommerce-image-plugin/      # 插件源码（打包发布用）
│   ├── manifest.json            # Manifest V3 配置
│   ├── content.js               # 内容脚本：提取页面图片
│   ├── background.js            # 后台：下载 / 打包
│   ├── lib/jszip.min.js         # ZIP 打包库（v3.10.1）
│   ├── viewer/                  # 图片展示新页面
│   └── icons/                   # 插件图标
├── website/                     # 官网（PC + 移动端）
│   ├── index.html
│   ├── preview.svg
│   └── ecommerce-image-plugin.zip   # 打包产物（下载入口）
└── README.md
```

## 安装使用

1. 下载 `website/ecommerce-image-plugin.zip` 并解压。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 右上角开启「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择解压后的目录。
5. 打开任意电商商品详情页，点击工具栏中的插件图标，即可抓取并预览图片。

## 工作原理

- **抓取**：点击图标 → `background.js` 向当前标签页发送消息 → `content.js` 遍历 DOM 提取图片 URL（去重）→ 存入 `chrome.storage.session` → 打开 `viewer/viewer.html`。
- **展示**：`viewer.js` 读取图片列表并渲染网格，使用 `referrerpolicy="no-referrer"` 加载图片以绕过部分防盗链。
- **下载**：
  - 单张：`background.js` 通过 `chrome.downloads` 直接下载原图。
  - 打包：`background.js` 用 `fetch` 读取图片二进制（受 `<all_urls>` 权限豁免 CORS），交给 JSZip 打包后以 `data:` URL 下载。

## 本地开发

```bash
# 打包插件为 ZIP（Windows PowerShell）
Compress-Archive -Path "ecommerce-image-plugin\*" -DestinationPath "website\ecommerce-image-plugin.zip" -Force
```

## 许可

仅供学习与合法用途，请遵守目标网站的使用条款。
