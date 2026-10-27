/**
 * 电商图片下载助手 —— 内容脚本
 * 职责：在当前电商详情页提取所有图片 URL（含懒加载、srcset、背景图等），
 *      去重后返回给 background service worker。
 */

// 需要忽略的小图标/占位图最小尺寸阈值（像素）
const MIN_WIDTH = 60;
const MIN_HEIGHT = 60;

// 常见懒加载属性
const LAZY_ATTRS = [
  'data-src',
  'data-original',
  'data-lazy-src',
  'data-lazy',
  'data-url',
  'data-img',
  'data-image',
  'data-echo',
  'data-srcset'
];

/** 解析 srcset 字符串，返回按尺寸从大到小排序的 URL 列表 */
function parseSrcset(srcset) {
  const urls = [];
  if (!srcset) return urls;
  srcset.split(',').forEach((part) => {
    const seg = part.trim().split(/\s+/);
    if (seg.length >= 1 && seg[0]) {
      // 提取描述符（如 1x、2x、800w）
      let descriptor = 0;
      if (seg.length >= 2) {
        const m = seg[1].match(/^([\d.]+)([xw])$/i);
        if (m) descriptor = parseFloat(m[1]);
      }
      urls.push({ url: seg[0], size: descriptor });
    }
  });
  urls.sort((a, b) => b.size - a.size);
  return urls.map((u) => u.url);
}

/** 将可能为相对路径的 URL 转换为绝对 URL */
function toAbsolute(url) {
  if (!url) return null;
  url = url.trim();
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return null;
  try {
    return new URL(url, document.baseURI).href;
  } catch (e) {
    return null;
  }
}

/** 提取单个 img 元素的最佳图片 URL */
function extractFromImg(img) {
  const candidates = [];

  // 1. 懒加载属性（优先，电商常把高清图放在这里）
  for (const attr of LAZY_ATTRS) {
    const v = img.getAttribute(attr);
    if (v) {
      if (attr === 'data-srcset') {
        candidates.push(...parseSrcset(v));
      } else {
        candidates.push(v);
      }
    }
  }

  // 2. srcset（解析所有候选，取最大尺寸优先）
  const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
  if (srcset) candidates.push(...parseSrcset(srcset));

  // 3. 当前 src
  const src = img.currentSrc || img.src;
  if (src) candidates.push(src);

  // 依次尝试转为绝对 URL，取第一个有效值
  for (const c of candidates) {
    const abs = toAbsolute(c);
    if (abs) return abs;
  }
  return null;
}

/** 从 CSS 背景图提取 URL */
function extractFromBackground(el) {
  const bg = getComputedStyle(el).backgroundImage;
  if (!bg || bg === 'none') return [];
  const results = [];
  const re = /url\((['"]?)(.*?)\1\)/g;
  let m;
  while ((m = re.exec(bg)) !== null) {
    const abs = toAbsolute(m[2]);
    if (abs) results.push(abs);
  }
  return results;
}

/** 判断元素是否为需要跳过的「无效/占位」图片 */
function isMeaningful(img) {
  const rect = img.getBoundingClientRect();
  const w = img.naturalWidth || rect.width || 0;
  const h = img.naturalHeight || rect.height || 0;
  // 尺寸过小的图标、透明占位图一律跳过
  if (w > 0 && h > 0 && (w < MIN_WIDTH || h < MIN_HEIGHT)) return false;
  // 1x1 像素的追踪/占位图
  if (w <= 1 && h <= 1) return false;
  return true;
}

/** 主提取函数：遍历 DOM 收集全部图片 URL */
function collectImages() {
  const urlSet = new Set();
  const seen = new Set();

  // 1. 所有 img 标签
  document.querySelectorAll('img').forEach((img) => {
    if (!isMeaningful(img)) return;
    const url = extractFromImg(img);
    if (url) urlSet.add(url);
  });

  // 2. 带有 background-image 的元素（商品橱窗、广告位等）
  document.querySelectorAll('div,section,li,a,span,figure').forEach((el) => {
    const urls = extractFromBackground(el);
    urls.forEach((u) => urlSet.add(u));
  });

  // 3. 也检查 <picture> 内的 <source>
  document.querySelectorAll('picture source').forEach((src) => {
    const srcset = src.getAttribute('srcset');
    if (srcset) parseSrcset(srcset).forEach((u) => {
      const abs = toAbsolute(u);
      if (abs) urlSet.add(abs);
    });
  });

  // 去重并保持稳定顺序
  return Array.from(urlSet).filter(Boolean);
}

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'EXTRACT_IMAGES') {
    const images = collectImages();
    sendResponse({ ok: true, count: images.length, images });
    return true; // 保持消息通道开启（同步返回即可，这里为保险返回 true）
  }
});
