/**
 * 电商图片下载助手 —— 后台服务（Manifest V3 Service Worker）
 * 职责：
 *   1. 响应插件图标点击，触发内容脚本抓取图片并打开展示页；
 *   2. 处理下载请求：单张下载（原图）与多张打包（ZIP）。
 */

// 引入 JSZip（classic service worker 顶层 importScripts）
importScripts('lib/jszip.min.js');

const VIEWER_URL = chrome.runtime.getURL('viewer/viewer.html');

// ---------------------------------------------------------------------------
// 图标点击：抓取当前页图片
// ---------------------------------------------------------------------------
chrome.action.onClicked.addListener(async (tab) => {
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_IMAGES' });
    if (resp && resp.ok && resp.images && resp.images.length > 0) {
      await chrome.storage.session.set({
        images: resp.images,
        pageTitle: tab.title || '',
        pageUrl: tab.url || ''
      });
    } else {
      await chrome.storage.session.set({
        images: [],
        pageTitle: tab.title || '',
        pageUrl: tab.url || ''
      });
    }
  } catch (err) {
    // 受限页面（chrome:// 等）无法注入内容脚本，或脚本尚未就绪
    await chrome.storage.session.set({
      images: [],
      pageTitle: tab.title || '',
      pageUrl: tab.url || '',
      error: '当前页面无法抓取（可能是浏览器内部页面或插件尚未加载）。请在普通网页刷新后重试。'
    });
  }
  await chrome.tabs.create({ url: VIEWER_URL });
});

// ---------------------------------------------------------------------------
// 消息路由：来自 viewer 页面的下载请求
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return;

  if (message.type === 'DOWNLOAD_SINGLE') {
    downloadSingle(message.url)
      .then((info) => sendResponse({ ok: true, info }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true; // 异步响应
  }

  if (message.type === 'DOWNLOAD_ZIP') {
    downloadZip(message.urls)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
});

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 根据 URL 与 content-type 推断图片扩展名 */
function getExtension(url, contentType) {
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];
  let ext = '';
  try {
    const m = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (m) ext = m[1].toLowerCase();
  } catch (e) { /* ignore */ }
  if (imageExts.includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;

  if (contentType) {
    const m = contentType.match(/image\/([\w+-]+)/);
    if (m) {
      const t = m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      if (imageExts.includes(t)) return t;
    }
  }
  return 'png'; // 兜底
}

/** 从 URL 生成安全的文件名（清理非法字符） */
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|#%]/g, '_').replace(/\s+/g, '_');
}

/** 单张图片下载：直接使用原图 URL，由浏览器完成下载 */
async function downloadSingle(url) {
  const ext = getExtension(url);
  const base = sanitizeFilename(new URL(url).pathname.split('/').pop() || 'image');
  const filename = 'ecommerce-images/' + (base.includes('.') ? base : base + '.' + ext);
  return await chrome.downloads.download({ url, filename, saveAs: false });
}

/**
 * 多张图片打包为 ZIP：
 *   - 在 service worker 中 fetch 图片（受 host_permissions <all_urls> 豁免 CORS）；
 *   - 打包为 ZIP，转 base64 data URL 后下载（MV3 SW 不支持 createObjectURL）。
 */
async function downloadZip(urls) {
  if (!urls || urls.length === 0) throw new Error('没有可打包的图片');

  const zip = new JSZip();
  let added = 0;
  const failed = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      if (blob.size === 0) throw new Error('空文件');
      const ext = getExtension(url, resp.headers.get('content-type'));
      const filename = 'image_' + String(i + 1).padStart(3, '0') + '.' + ext;
      zip.file(filename, blob);
      added++;
    } catch (e) {
      failed.push({ url, reason: String(e) });
    }
  }

  if (added === 0) throw new Error('所有图片均下载失败，可能是防盗链限制。');

  const base64 = await zip.generateAsync({ type: 'base64' });
  const dataUrl = 'data:application/zip;base64,' + base64;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const filename = `ecommerce-images/ecommerce-images-${stamp}.zip`;
  const info = await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });

  return { added, failed: failed.length, info };
}
