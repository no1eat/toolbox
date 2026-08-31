/* ============ 公共层：注册机制 / 路由 / 主题 / 工具函数 ============ */
window.Toolbox = {
  modules: [],
  register(mod) { this.modules.push(mod); }
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- 通用工具 ---------- */
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function toast(msg, type = '') {
  const box = $('#toast-box');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

async function downloadZip(files, zipName) {
  // files: [{ name, blob }]
  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f.blob));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  downloadBlob(blob, zipName);
  toast(`已打包 ${files.length} 个文件`, 'success');
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast('已复制到剪贴板', 'success');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板', 'success'); }
    catch { toast('复制失败，请手动复制', 'error'); }
    ta.remove();
  }
}

function dataURLtoBlob(dataURL) {
  const [meta, b64] = dataURL.split(',');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: meta.match(/:(.*?);/)[1] });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 主题 ---------- */
function initTheme() {
  const saved = localStorage.getItem('toolbox_theme');
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-btn').textContent = dark ? '☀️' : '🌙';
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme !== 'dark';
  const flip = () => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('toolbox_theme', dark ? 'dark' : 'light');
    $('#theme-btn').textContent = dark ? '☀️' : '🌙';
  };

  const btn = $('#theme-btn');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reduceMotion && document.startViewTransition) {
    // 两个方向都只动画“新主题层”，且初始裁剪由 CSS 首帧生效——不会闪另一色
    const rect = btn.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    // 两个方向统一：新主题层（即切换后的主题）以按钮为圆心从 0 扩张到全屏
    document.documentElement.style.setProperty('--vt-clip', `circle(0px at ${x}px ${y}px)`); // 伪元素首帧即裁剪
    document.documentElement.classList.add('vt-clip');
    document.documentElement.classList.add('no-theme-anim'); // 切换期间关闭全站渐变，避免重影
    const vt = document.startViewTransition(flip);
    // 兜底：若过渡因窗口可见性抖动等原因卡在第一帧未推进，
    // 700ms 后强制跳到终态——把"冻结在中间帧"变成"立即完成"
    const safety = setTimeout(() => { try { vt.skipTransition(); } catch {} }, 700);
    const cleanup = () => {
      clearTimeout(safety);
      document.documentElement.classList.remove('no-theme-anim');
      document.documentElement.classList.remove('vt-clip');
    };
    vt.ready.then(() => {
      clearTimeout(safety);
      const waapi = document.documentElement.animate(
        [
          { clipPath: `circle(0px at ${x}px ${y}px)` },
          { clipPath: `circle(${endRadius}px at ${x}px ${y}px)` }
        ],
        { duration: 450, easing: 'ease-in-out', pseudoElement: '::view-transition-new(root)', fill: 'forwards' }
      );
      // 关键清理：fill:forwards 的动画会在 ::view-transition 伪元素上残留“终态”，
      // 并在下一次过渡时重新作用（表现为闪黑/闪烁），过渡结束必须显式 cancel
      vt.finished.finally(() => {
        waapi.cancel();
        cleanup();
      });
    }).catch(() => {
      cleanup(); // 过渡被跳过（如页面隐藏）时已是终态，直接清理
    });
  } else {
    flip(); // 旧浏览器 / 减少动态效果：走全站渐变或直接切换
  }

  // 按钮转一圈
  btn.classList.remove('spin');
  void btn.offsetWidth; // 重启动画
  btn.classList.add('spin');
  btn.addEventListener('animationend', () => btn.classList.remove('spin'), { once: true });
}

/* ---------- 路由 ---------- */
// 注意：模块脚本在 app.js 之后加载，路由表必须在使用时动态构建
function routes() {
  const map = { home: { name: '首页', icon: '🏠' } };
  Toolbox.modules.forEach(m => { map[m.id] = { name: m.name, icon: m.icon, mod: m }; });
  return map;
}

function currentRoute() {
  const map = routes();
  const id = location.hash.replace(/^#\/?/, '') || 'home';
  return map[id] ? id : 'home';
}

function navigate() {
  const map = routes();
  const id = currentRoute();
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + id; });
  const route = map[id];
  $('#page-title').textContent = route.name;
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === id));
  if (route.mod && !route.mod._inited) {
    route.mod._inited = true;
    try { route.mod.init(); } catch (e) { console.error(e); toast(route.name + ' 初始化失败：' + e.message, 'error'); }
  }
  $('.main').scrollTop = 0;
  window.scrollTo(0, 0);
}

function buildNav() {
  const nav = $('#nav');
  Object.entries(routes()).forEach(([id, r]) => {
    const a = document.createElement('a');
    a.href = '#/' + id;
    a.dataset.route = id;
    a.innerHTML = `<span class="ico">${r.icon}</span>${r.name}`;
    nav.appendChild(a);
  });
}

function buildHome() {
  const grid = $('#home-cards');
  Toolbox.modules.forEach(m => {
    const a = document.createElement('a');
    a.className = 'tool-card';
    a.href = '#/' + m.id;
    a.innerHTML = `<div class="t-ico">${m.icon}</div><div class="t-name">${m.name}</div><div class="t-desc">${m.desc}</div>`;
    grid.appendChild(a);
  });
}

/* ---------- 自定义下拉框 ----------
 * 用自绘控件替换原生 select 的外观与弹层（原生弹层无法自定义圆角/配色）。
 * 原 <select> 仍保留在 DOM 中作为数据源，工具代码照常读写 value 与监听 change。
 */
function enhanceSelects() {
  const allWraps = () => $$('.cselect');

  document.addEventListener('click', e => {
    allWraps().forEach(w => { if (!w.contains(e.target)) w.classList.remove('open'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') allWraps().forEach(w => w.classList.remove('open'));
  });

  $$('select').forEach(sel => {
    if (sel.dataset.enhanced) return;
    sel.dataset.enhanced = '1';

    const wrap = document.createElement('div');
    wrap.className = 'cselect';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cselect-btn';
    const pop = document.createElement('div');
    pop.className = 'cselect-pop';
    wrap.append(btn, pop);
    sel.replaceWith(wrap); // 先占位，再把 select 移入组件（顺序不能反）
    wrap.appendChild(sel);
    sel.style.display = 'none';

    const label = () => {
      const opt = sel.options[sel.selectedIndex];
      btn.textContent = opt ? opt.textContent : '';
    };

    const buildItems = () => {
      pop.innerHTML = '';
      [...sel.options].forEach(opt => {
        const item = document.createElement('div');
        item.className = 'cselect-opt' + (opt.selected ? ' sel' : '');
        item.textContent = opt.textContent;
        item.addEventListener('click', () => {
          if (sel.value !== opt.value) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          label();
          wrap.classList.remove('open');
        });
        pop.appendChild(item);
      });
    };

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const opening = !wrap.classList.contains('open');
      allWraps().forEach(w => w.classList.remove('open'));
      if (opening) { buildItems(); wrap.classList.add('open'); }
    });

    // 打开状态下支持 ↑/↓ 快捷选择
    btn.addEventListener('keydown', e => {
      if (!wrap.classList.contains('open') || !sel.options.length) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const j = e.key === 'ArrowDown'
        ? Math.min(sel.options.length - 1, sel.selectedIndex + 1)
        : Math.max(0, sel.selectedIndex - 1);
      if (j === sel.selectedIndex) return;
      sel.value = sel.options[j].value;
      label(); buildItems();
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // 选项列表被动态重建（如工作表列表）时同步按钮文字
    new MutationObserver(label).observe(sel, { childList: true });
    sel.addEventListener('change', label);
    label();
  });
}

/* ---------- 启动 ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  $('#theme-btn').addEventListener('click', toggleTheme);
  buildNav();
  buildHome();
  enhanceSelects();
  window.addEventListener('hashchange', navigate);
  navigate();
});
