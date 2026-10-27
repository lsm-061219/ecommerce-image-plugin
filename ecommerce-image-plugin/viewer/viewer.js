/**
 * 电商图片下载助手 —— 展示页逻辑
 * 职责：读取图片列表、渲染网格、处理选择与下载交互。
 */

const state = {
  images: [],
  selected: new Set(),
  pageTitle: '',
  pageUrl: ''
};

// DOM 引用
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const emptyText = document.getElementById('emptyText');
const pageTitleEl = document.getElementById('pageTitle');
const statEl = document.getElementById('stat');
const statusEl = document.getElementById('status');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnInvert = document.getElementById('btnInvert');
const btnClear = document.getElementById('btnClear');
const btnDownloadSelected = document.getElementById('btnDownloadSelected');
const btnDownloadAll = document.getElementById('btnDownloadAll');

init();

async function init() {
  const data = await chrome.storage.session.get(['images', 'pageTitle', 'pageUrl', 'error']);
  state.images = data.images || [];
  state.pageTitle = data.pageTitle || '';
  state.pageUrl = data.pageUrl || '';

  if (data.error) {
    setStatus(data.error, 'err');
    showEmpty(data.error);
    return;
  }

  pageTitleEl.textContent = state.pageTitle;
  pageTitleEl.title = state.pageTitle;

  if (state.images.length === 0) {
    showEmpty('未检测到图片');
    setStatus('未抓取到图片，请返回商品详情页重试。', 'err');
    return;
  }

  renderGrid();
  updateStat();
  setStatus(`已加载 ${state.images.length} 张图片`, 'ok');
  bindEvents();
}

function showEmpty(text) {
  empty.hidden = false;
  emptyText.textContent = text;
  grid.hidden = true;
}

function renderGrid() {
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  state.images.forEach((url, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.index = String(i);

    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = url;
    img.referrerPolicy = 'no-referrer'; // 绕过基于 Referer 的防盗链
    img.loading = 'lazy';
    img.alt = '图片 ' + (i + 1);
    img.onerror = () => { img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(placeholderSvg()); };

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'check';
    check.addEventListener('change', () => toggleSelect(i, check.checked));

    const index = document.createElement('span');
    index.className = 'index';
    index.textContent = String(i + 1);

    const btnSingle = document.createElement('button');
    btnSingle.className = 'download-single';
    btnSingle.textContent = '下载';
    btnSingle.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadSingle(url);
    });

    // 点击卡片切换选中
    card.addEventListener('click', () => {
      check.checked = !check.checked;
      toggleSelect(i, check.checked);
    });

    card.appendChild(img);
    card.appendChild(check);
    card.appendChild(index);
    card.appendChild(btnSingle);
    frag.appendChild(card);
  });

  grid.appendChild(frag);
}

function placeholderSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">' +
    '<rect width="200" height="200" fill="#eef0f4"/>' +
    '<text x="100" y="105" font-size="14" fill="#9ca3af" text-anchor="middle">加载失败</text>' +
    '</svg>';
}

function toggleSelect(index, selected) {
  if (selected) state.selected.add(index);
  else state.selected.delete(index);
  const card = grid.querySelector(`.card[data-index="${index}"]`);
  if (card) card.classList.toggle('selected', selected);
  updateStat();
}

function updateStat() {
  statEl.textContent = `${state.selected.size} / ${state.images.length} 张`;
}

function bindEvents() {
  btnSelectAll.addEventListener('click', () => {
    state.images.forEach((_, i) => {
      state.selected.add(i);
      const card = grid.querySelector(`.card[data-index="${i}"]`);
      if (card) {
        card.classList.add('selected');
        card.querySelector('.check').checked = true;
      }
    });
    updateStat();
  });

  btnInvert.addEventListener('click', () => {
    state.images.forEach((_, i) => {
      const checked = !state.selected.has(i);
      if (checked) state.selected.add(i);
      else state.selected.delete(i);
      const card = grid.querySelector(`.card[data-index="${i}"]`);
      if (card) {
        card.classList.toggle('selected', checked);
        card.querySelector('.check').checked = checked;
      }
    });
    updateStat();
  });

  btnClear.addEventListener('click', () => {
    state.selected.clear();
    grid.querySelectorAll('.card').forEach((card) => {
      card.classList.remove('selected');
      card.querySelector('.check').checked = false;
    });
    updateStat();
  });

  btnDownloadSelected.addEventListener('click', () => {
    const urls = Array.from(state.selected)
      .sort((a, b) => a - b)
      .map((i) => state.images[i]);
    if (urls.length === 0) {
      setStatus('请先勾选要下载的图片', 'err');
      return;
    }
    downloadZip(urls);
  });

  btnDownloadAll.addEventListener('click', () => {
    if (state.images.length === 0) return;
    downloadZip(state.images.slice());
  });
}

// ---- 与 background 通信 ----

function downloadSingle(url) {
  setStatus('正在下载单张图片...', '');
  chrome.runtime.sendMessage({ type: 'DOWNLOAD_SINGLE', url }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus('下载失败：' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (resp && resp.ok) setStatus('单张图片下载成功 ✓', 'ok');
    else setStatus('下载失败：' + (resp && resp.error), 'err');
  });
}

function downloadZip(urls) {
  setStatus(`正在打包 ${urls.length} 张图片...`, '');
  setButtonsDisabled(true);

  chrome.runtime.sendMessage({ type: 'DOWNLOAD_ZIP', urls }, (resp) => {
    setButtonsDisabled(false);
    if (chrome.runtime.lastError) {
      setStatus('打包失败：' + chrome.runtime.lastError.message, 'err');
      return;
    }
    if (resp && resp.ok) {
      const msg = `打包完成，成功 ${resp.added} 张，失败 ${resp.failed} 张`;
      setStatus(resp.failed > 0 ? msg + '（部分因防盗链跳过）' : msg + ' ✓', resp.failed > 0 ? '' : 'ok');
    } else {
      setStatus('打包失败：' + (resp && resp.error), 'err');
    }
  });
}

function setButtonsDisabled(disabled) {
  [btnSelectAll, btnInvert, btnClear, btnDownloadSelected, btnDownloadAll]
    .forEach((b) => (b.disabled = disabled));
}

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}
