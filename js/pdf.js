/* ============ PDF 工具：合并 / 拆分（pdf-lib） + 转图片（pdf.js） ============ */
Toolbox.register({
  id: 'pdf',
  name: 'PDF 工具',
  icon: '📄',
  desc: 'PDF 合并、按页拆分 / 提取页码范围，以及 PDF 转图片（PNG / JPEG），全部本地处理。',
  init: initPdfTool
});

function initPdfTool() {
  /* ---------- 通用 ---------- */
  const { PDFDocument } = PDFLib;

  // 子面板切换（合并 / 拆分 / 转图片）
  $$('#pdf-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#pdf-tabs .tab').forEach(t => t.classList.toggle('active', t === tab));
      $('#pdf-pane-merge').hidden = tab.dataset.mode !== 'merge';
      $('#pdf-pane-split').hidden = tab.dataset.mode !== 'split';
      $('#pdf-pane-render').hidden = tab.dataset.mode !== 'render';
    });
  });

  // pdf.js worker：本地 http 环境用真实 Worker；file:// 直接打开时，
  // 预先把 pdf.worker.min.js 作为普通脚本加载（暴露 globalThis.pdfjsWorker），
  // pdf.js 会自动回退为主线程处理，避开 Chrome 禁止 file:// Worker 的限制。
  let workerReady = null;
  function ensurePdfJs() {
    if (!workerReady) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      workerReady = new Promise((resolve, reject) => {
        if (location.protocol !== 'file:' || globalThis.pdfjsWorker) return resolve();
        const s = document.createElement('script');
        s.src = 'vendor/pdf.worker.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('pdf.worker.min.js 加载失败'));
        document.head.appendChild(s);
      });
    }
    return workerReady;
  }

  // 解析 "1-3,5,8-" 形式的页码范围，返回去重升序的 0 起始页下标
  function parseRanges(str, maxPage) {
    const s = (str || '').trim().replace(/，/g, ',');
    if (!s) return Array.from({ length: maxPage }, (_, i) => i);
    const out = new Set();
    for (const part of s.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const m = t.match(/^(\d+)?\s*-\s*(\d+)?$/);
      if (m) {
        let a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : maxPage;
        if (a > b) [a, b] = [b, a];
        for (let i = Math.max(1, a); i <= Math.min(maxPage, b); i++) out.add(i - 1);
      } else if (/^\d+$/.test(t)) {
        if (+t >= 1 && +t <= maxPage) out.add(+t - 1);
      } else {
        throw new Error(`无法识别的页码：“${t}”`);
      }
    }
    if (!out.size) throw new Error('页码范围为空，请检查输入');
    return [...out].sort((a, b) => a - b);
  }

  function bindDrop(dropSel, inputSel, handler) {
    const drop = $(dropSel), input = $(inputSel);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { handler([...input.files]); input.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      handler([...e.dataTransfer.files]);
    });
  }

  function isPdf(file) {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  }

  /* 文件信息条：醒目展示已加载的文件与处理进度 */
  function setFileChip(el, file, pagesText) {
    el.innerHTML = `<span class="fi-ico">📄</span><span class="fi-name">${escapeHtml(file.name)}</span>` +
      `<span class="fi-meta">${formatBytes(file.size)}${pagesText ? ' · ' + pagesText : ''}</span>`;
    el.hidden = false;
  }
  function setStatusChip(el, text, icon = '⏳', ok = false) {
    el.className = 'file-chip' + (ok ? ' ok' : '');
    el.innerHTML = `<span class="fi-ico">${icon}</span><span>${escapeHtml(text)}</span>`;
    el.hidden = false;
  }
  function clearChip(el) {
    el.hidden = true;
    el.innerHTML = '';
  }

  /* ---------- 合并 ---------- */
  const mergeList = $('#pdf-merge-list'), mergeRun = $('#pdf-merge-run');
  let mergeFiles = [];

  bindDrop('#pdf-merge-drop', '#pdf-merge-file', files => {
    const pdfs = files.filter(isPdf);
    if (!pdfs.length) { toast('请选择 PDF 文件', 'error'); return; }
    mergeFiles.push(...pdfs);
    renderMerge();
  });
  $('#pdf-merge-clear').addEventListener('click', () => { mergeFiles = []; renderMerge(); });
  mergeRun.addEventListener('click', async () => {
    if (!mergeFiles.length) return;
    mergeRun.disabled = true;
    mergeRun.textContent = '合并中…';
    try {
      const out = await PDFDocument.create();
      for (const f of mergeFiles) {
        const bytes = await f.arrayBuffer();
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      }
      const saved = await out.save();
      downloadBlob(new Blob([saved], { type: 'application/pdf' }), 'merged.pdf');
      toast(`已合并 ${mergeFiles.length} 个文件，共 ${out.getPageCount()} 页`, 'success');
    } catch (e) {
      console.error(e);
      toast('合并失败：' + e.message, 'error');
    }
    mergeRun.disabled = false;
    mergeRun.textContent = '合并并下载';
  });

  let mergeDragIdx = -1; // 拖动换位：被拖动行的下标

  function renderMerge() {
    mergeList.innerHTML = '';
    mergeFiles.forEach((f, idx) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML = `
        <span class="ico">📄</span>
        <div class="r-main">
          <div class="r-name" title="${escapeHtml(f.name)}">${idx + 1}. ${escapeHtml(f.name)}</div>
          <div class="r-meta">${formatBytes(f.size)}</div>
        </div>`;
      const up = document.createElement('button');
      up.className = 'row-btn'; up.textContent = '↑'; up.title = '上移（已在顶部时循环到末尾）';
      up.addEventListener('click', () => {
        const j = (idx - 1 + mergeFiles.length) % mergeFiles.length;
        [mergeFiles[j], mergeFiles[idx]] = [mergeFiles[idx], mergeFiles[j]];
        renderMerge();
      });
      const down = document.createElement('button');
      down.className = 'row-btn'; down.textContent = '↓'; down.title = '下移（已在末尾时循环到顶部）';
      down.addEventListener('click', () => {
        const j = (idx + 1) % mergeFiles.length;
        [mergeFiles[j], mergeFiles[idx]] = [mergeFiles[idx], mergeFiles[j]];
        renderMerge();
      });
      const del = document.createElement('button');
      del.className = 'row-btn'; del.textContent = '✕'; del.title = '移除';
      del.addEventListener('click', () => { mergeFiles.splice(idx, 1); renderMerge(); });
      row.append(up, down, del);

      // 拖动换位
      row.draggable = true;
      row.addEventListener('dragstart', e => {
        mergeDragIdx = idx;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
      });
      row.addEventListener('dragend', () => {
        mergeDragIdx = -1;
        $$('#pdf-merge-list .result-row').forEach(r => r.classList.remove('dragging', 'drag-over'));
      });
      row.addEventListener('dragover', e => {
        if (mergeDragIdx === -1) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        row.classList.toggle('drag-over', mergeDragIdx !== idx);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', e => {
        e.preventDefault();
        if (mergeDragIdx === -1 || mergeDragIdx === idx) return;
        const [moved] = mergeFiles.splice(mergeDragIdx, 1);
        mergeFiles.splice(idx, 0, moved);
        renderMerge();
      });

      mergeList.appendChild(row);
    });
    mergeRun.disabled = mergeFiles.length < 1;
  }

  /* ---------- 拆分 ---------- */
  const splitMode = $('#pdf-split-mode'), splitRangeWrap = $('#pdf-split-range-wrap');
  const splitInfo = $('#pdf-split-info'), splitRun = $('#pdf-split-run');
  let splitFile = null, splitPageCount = 0;

  splitMode.addEventListener('change', () => {
    splitRangeWrap.hidden = splitMode.value !== 'extract';
  });

  bindDrop('#pdf-split-drop', '#pdf-split-file', async files => {
    const f = files[0];
    if (!f || !isPdf(f)) { toast('请选择 PDF 文件', 'error'); return; }
    splitFile = f;
    try {
      const src = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
      splitPageCount = src.getPageCount();
      setFileChip(splitInfo, f, `共 ${splitPageCount} 页`);
      splitRun.disabled = false;
    } catch (e) {
      splitFile = null; splitRun.disabled = true;
      clearChip(splitInfo);
      toast('无法读取该 PDF：' + e.message, 'error');
    }
  });

  splitRun.addEventListener('click', async () => {
    if (!splitFile) return;
    splitRun.disabled = true;
    splitRun.textContent = '处理中…';
    try {
      const src = await PDFDocument.load(await splitFile.arrayBuffer(), { ignoreEncryption: true });
      const base = splitFile.name.replace(/\.pdf$/i, '');
      if (splitMode.value === 'each') {
        const files = [];
        for (let i = 0; i < splitPageCount; i++) {
          setStatusChip(splitInfo, `正在拆分第 ${i + 1} / ${splitPageCount} 页…`);
          const doc = await PDFDocument.create();
          const [page] = await doc.copyPages(src, [i]);
          doc.addPage(page);
          const saved = await doc.save();
          files.push({ name: `${base}_${String(i + 1).padStart(2, '0')}.pdf`, blob: new Blob([saved], { type: 'application/pdf' }) });
        }
        if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
        else await downloadZip(files, base + '_split.zip');
        toast(`拆分完成，共 ${files.length} 个文件`, 'success');
      } else {
        const indices = parseRanges($('#pdf-split-range').value, splitPageCount);
        const doc = await PDFDocument.create();
        const pages = await doc.copyPages(src, indices);
        pages.forEach(p => doc.addPage(p));
        const saved = await doc.save();
        downloadBlob(new Blob([saved], { type: 'application/pdf' }), `${base}_pages.pdf`);
        toast(`已提取 ${indices.length} 页`, 'success');
      }
    } catch (e) {
      console.error(e);
      toast('拆分失败：' + e.message, 'error');
    }
    splitRun.disabled = false;
    splitRun.textContent = '执行拆分';
  });

  /* ---------- 转图片 ---------- */
  const renderInfo = $('#pdf-render-info'), renderRun = $('#pdf-render-run');
  const renderPreviews = $('#pdf-render-previews'), renderZip = $('#pdf-render-zip');
  let renderFile = null, renderPageCount = 0, imageBlobs = [];

  bindDrop('#pdf-render-drop', '#pdf-render-file', async files => {
    const f = files[0];
    if (!f || !isPdf(f)) { toast('请选择 PDF 文件', 'error'); return; }
    renderFile = f;
    try {
      await ensurePdfJs();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      renderPageCount = pdf.numPages;
      setFileChip(renderInfo, f, `共 ${renderPageCount} 页`);
      renderRun.disabled = false;
    } catch (e) {
      console.error(e);
      renderFile = null; renderRun.disabled = true;
      clearChip(renderInfo);
      toast('无法读取该 PDF：' + e.message, 'error');
    }
  });

  renderRun.addEventListener('click', async () => {
    if (!renderFile) return;
    renderRun.disabled = true; renderZip.disabled = true;
    renderPreviews.innerHTML = '';
    imageBlobs = [];
    const base = renderFile.name.replace(/\.pdf$/i, '');
    try {
      await ensurePdfJs();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await renderFile.arrayBuffer()) }).promise;
      const indices = parseRanges($('#pdf-render-range').value, pdf.numPages);
      const scale = +$('#pdf-render-scale').value;
      const fmt = $('#pdf-render-format').value;
      const ext = fmt === 'image/png' ? 'png' : 'jpg';

      for (let n = 0; n < indices.length; n++) {
        const pageNo = indices[n] + 1;
        setStatusChip(renderInfo, `正在渲染第 ${pageNo} 页（${n + 1} / ${indices.length}）…`);
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (fmt === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise(res => canvas.toBlob(res, fmt, fmt === 'image/jpeg' ? 0.92 : undefined));
        if (!blob) throw new Error('图片编码失败');
        imageBlobs.push({ name: `${base}_p${String(pageNo).padStart(3, '0')}.${ext}`, blob });

        const item = document.createElement('div');
        item.className = 'thumb-item';
        const url = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.src = url; img.loading = 'lazy';
        const label = document.createElement('div');
        label.className = 't-label';
        label.textContent = `第 ${pageNo} 页 · ${formatBytes(blob.size)}`;
        const btn = document.createElement('button');
        btn.className = 'btn'; btn.textContent = '下载';
        btn.addEventListener('click', () => downloadBlob(blob, `${base}_p${pageNo}.${ext}`));
        item.append(img, label, btn);
        renderPreviews.appendChild(item);
      }
      setStatusChip(renderInfo, `完成：共生成 ${imageBlobs.length} 张图片`, '✅', true);
      renderZip.disabled = imageBlobs.length < 2;
      toast('转换完成', 'success');
    } catch (e) {
      console.error(e);
      renderInfo.textContent = '';
      toast('转换失败：' + e.message, 'error');
    }
    renderRun.disabled = false;
  });

  renderZip.addEventListener('click', () => {
    if (imageBlobs.length) downloadZip(imageBlobs, 'pdf_images.zip');
  });
}
