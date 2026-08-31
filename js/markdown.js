/* ============ Markdown 编辑器（marked + DOMPurify） ============ */
Toolbox.register({
  id: 'markdown',
  name: 'Markdown 编辑器',
  icon: '📝',
  desc: '带工具栏的实时 Markdown 编辑器：编辑与预览分屏，支持导入导出 .md / .html、复制 HTML，草稿自动保存。',
  init: initMarkdownTool
});

function initMarkdownTool() {
  const input = $('#md-input'), preview = $('#md-preview'), stats = $('#md-stats');
  const DRAFT_KEY = 'toolbox_md_draft';
  let renderTimer = null;

  marked.setOptions({ gfm: true, breaks: true });

  function render() {
    const raw = input.value;
    const html = marked.parse(raw);
    preview.innerHTML = DOMPurify.sanitize(html);
    const chars = raw.length;
    const lines = raw ? raw.split('\n').length : 0;
    stats.textContent = `${lines} 行 · ${chars} 字符`;
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      render();
      try { localStorage.setItem(DRAFT_KEY, input.value); } catch {}
    }, 150);
  }

  input.addEventListener('input', scheduleRender);

  // 编辑区滚动同步到预览区
  input.addEventListener('scroll', () => {
    const max = input.scrollHeight - input.clientHeight;
    if (max <= 0) return;
    preview.scrollTop = (preview.scrollHeight - preview.clientHeight) * (input.scrollTop / max);
  });

  /* ---------- 工具栏 ---------- */
  function insert(before, after = '', placeholder = '') {
    const start = input.selectionStart, end = input.selectionEnd;
    const sel = input.value.slice(start, end) || placeholder;
    const text = before + sel + after;
    input.setRangeText(text, start, end, 'select');
    // 选中中间内容，方便继续输入
    input.selectionStart = start + before.length;
    input.selectionEnd = start + before.length + sel.length;
    input.focus();
    input.dispatchEvent(new Event('input'));
  }

  function prefixLine(prefix) {
    const start = input.selectionStart;
    const lineStart = input.value.lastIndexOf('\n', start - 1) + 1;
    input.setRangeText(prefix, lineStart, lineStart, 'end');
    input.focus();
    input.dispatchEvent(new Event('input'));
  }

  $('#md-toolbar').addEventListener('click', e => {
    const btn = e.target.closest('button[data-md]');
    if (!btn) return;
    switch (btn.dataset.md) {
      case 'bold': insert('**', '**', '加粗文字'); break;
      case 'italic': insert('*', '*', '斜体文字'); break;
      case 'heading': prefixLine('## '); break;
      case 'link': insert('[', '](https://)', '链接文字'); break;
      case 'image': insert('![', '](https://example.com/image.png)', '图片描述'); break;
      case 'inlinecode': insert('`', '`', 'code'); break;
      case 'codeblock': insert('\n```\n', '\n```\n', 'code block'); break;
      case 'quote': prefixLine('> '); break;
      case 'ul': prefixLine('- '); break;
      case 'ol': prefixLine('1. '); break;
      case 'table': insert('\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n'); break;
      case 'hr': insert('\n---\n'); break;
    }
  });

  /* ---------- 导入 / 导出 ---------- */
  $('#md-open').addEventListener('click', () => $('#md-file').click());
  $('#md-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    input.value = await file.text();
    render();
    try { localStorage.setItem(DRAFT_KEY, input.value); } catch {}
    toast('已导入 ' + file.name, 'success');
  });

  $('#md-copy').addEventListener('click', () => {
    copyText(DOMPurify.sanitize(marked.parse(input.value)));
  });

  function currentTitle() {
    const m = input.value.match(/^#\s+(.+)$/m);
    return m ? m[1].trim().slice(0, 40) : 'markdown';
  }

  $('#md-download-md').addEventListener('click', () => {
    if (!input.value.trim()) { toast('内容为空', 'error'); return; }
    downloadBlob(new Blob([input.value], { type: 'text/markdown;charset=utf-8' }), currentTitle() + '.md');
  });

  $('#md-download-html').addEventListener('click', () => {
    if (!input.value.trim()) { toast('内容为空', 'error'); return; }
    const body = DOMPurify.sanitize(marked.parse(input.value));
    const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(currentTitle())}</title>
<style>
body{max-width:800px;margin:40px auto;padding:0 20px;font-family:system-ui,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;color:#24292f}
h1,h2,h3{border-bottom:1px solid #d8dee4;padding-bottom:6px}
pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}
code{background:#f6f8fa;padding:2px 5px;border-radius:4px}
blockquote{border-left:4px solid #d0d7de;margin:8px 0;padding:2px 14px;color:#57606a}
table{border-collapse:collapse}th,td{border:1px solid #d0d7de;padding:6px 14px}
img{max-width:100%}a{color:#0969da}
</style>
</head>
<body>
${body}
</body>
</html>`;
    downloadBlob(new Blob([doc], { type: 'text/html;charset=utf-8' }), currentTitle() + '.html');
  });

  $('#md-clear').addEventListener('click', () => {
    if (!input.value) return;
    input.value = '';
    render();
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    toast('已清空');
  });

  /* ---------- 初始化：恢复草稿或示例 ---------- */
  let saved = '';
  try { saved = localStorage.getItem(DRAFT_KEY) || ''; } catch {}
  if (!saved) {
    saved = [
      '# 欢迎使用 Markdown 编辑器',
      '',
      '左侧编辑，右侧**实时预览**。草稿会自动保存在本地。',
      '',
      '## 常用语法',
      '',
      '- **加粗** 与 *斜体*',
      '- [链接](https://example.com) 与 `行内代码`',
      '- 引用：',
      '  > 这是一段引用',
      '',
      '```js',
      'console.log("Hello, 不吃工具箱!");',
      '```',
      '',
      '| 工具 | 说明 |',
      '| --- | --- |',
      '| 图片压缩 | Canvas 本地处理 |',
      '| PDF 工具 | pdf-lib + pdf.js |',
      ''
    ].join('\n');
  }
  input.value = saved;
  render();
}
