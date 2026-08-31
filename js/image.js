/* ============ 图片压缩 / 格式转换（Canvas） ============ */
Toolbox.register({
  id: 'image',
  name: '图片工具',
  icon: '🖼️',
  desc: '图片压缩、格式转换（JPEG / PNG / WebP）、文字 / 图片水印与 AI 一键去背景，Canvas 本地批量处理。',
  init: initImageTool
});

function initImageTool() {
  const drop = $('#img-drop'), input = $('#img-file'), list = $('#img-list');
  const fmtSel = $('#img-format'), qRange = $('#img-quality'), qVal = $('#img-q-val');
  const maxWIn = $('#img-maxw'), maxHIn = $('#img-maxh');
  const rerunBtn = $('#img-rerun'), zipBtn = $('#img-zip'), clearBtn = $('#img-clear');
  let items = []; // { file, name, status, result: { blob, name, width, height, fmt } }

  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  qRange.addEventListener('input', () => { qVal.textContent = qRange.value; });

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  clearBtn.addEventListener('click', () => { items = []; render(); });
  rerunBtn.addEventListener('click', () => processAll());
  zipBtn.addEventListener('click', () => {
    const done = items.filter(it => it.result);
    if (!done.length) return;
    const files = done.map(it => ({ name: it.result.name, blob: it.result.blob }));
    downloadZip(files, 'images.zip');
  });

  function addFiles(fileList) {
    const imgs = [...fileList].filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(f.name));
    if (!imgs.length) { toast('请选择图片文件', 'error'); return; }
    imgs.forEach(f => items.push({ file: f, name: f.name, status: 'pending', result: null }));
    render();
    processAll();
  }

  function render() {
    list.innerHTML = '';
    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      const meta = [];
      if (it.status === 'done' && it.result) {
        const diff = it.result.blob.size - it.file.size;
        const pct = it.file.size ? Math.round(diff / it.file.size * 100) : 0;
        const tag = diff <= 0
          ? `<span class="save">${it.result.blob.size === it.file.size ? '体积不变' : '节省 ' + (-pct) + '%'}</span>`
          : `<span class="cost">增大 ${pct}%（可调低质量或缩小尺寸）</span>`;
        meta.push(`${formatBytes(it.file.size)} → ${formatBytes(it.result.blob.size)} ${tag}`);
        meta.push(`${it.result.width}×${it.result.height} · ${it.result.fmtName}`);
      } else if (it.status === 'error') {
        meta.push(`<span class="cost">处理失败：${escapeHtml(it.error || '未知错误')}</span>`);
      } else {
        meta.push('处理中…');
      }
      row.innerHTML = `
        ${it.result?.thumb ? `<img class="thumb" src="${it.result.thumb}" alt="">` : '<div class="thumb"></div>'}
        <div class="r-main">
          <div class="r-name" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</div>
          <div class="r-meta">${meta.join(' · ')}</div>
        </div>`;
      if (it.result) {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = '下载';
        btn.addEventListener('click', () => downloadBlob(it.result.blob, it.result.name));
        row.appendChild(btn);
      }
      const del = document.createElement('button');
      del.className = 'row-btn';
      del.title = '移除';
      del.textContent = '✕';
      del.addEventListener('click', () => { items.splice(idx, 1); render(); });
      row.appendChild(del);
      list.appendChild(row);
    });
    rerunBtn.disabled = !items.length;
    zipBtn.disabled = !items.some(it => it.result);
  }

  async function processAll() {
    if (!items.length) return;
    rerunBtn.disabled = true; zipBtn.disabled = true;
    for (const it of items) {
      it.status = 'pending'; it.result = null; render();
      try {
        it.result = await processOne(it.file);
        it.status = 'done';
      } catch (e) {
        console.error(e);
        it.status = 'error';
        it.error = e.message;
      }
      render();
    }
    rerunBtn.disabled = false;
    zipBtn.disabled = !items.some(i => i.result);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法解码该图片')); };
      img.src = url;
    });
  }

  async function processOne(file) {
    const { img, url } = await loadImage(file);
    try {
      let fmt = fmtSel.value || file.type;
      if (fmt === 'image/gif' || fmt === 'image/bmp' || fmt === 'image/svg+xml') fmt = 'image/png'; // Canvas 无法直接编码，转 PNG

      let w = img.naturalWidth || img.width || 1024;
      let h = img.naturalHeight || img.height || 1024;
      const maxW = +maxWIn.value || 0, maxH = +maxHIn.value || 0;
      const scale = Math.min(1, maxW ? maxW / w : 1, maxH ? maxH / h : 1);
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      if (fmt === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } // JPEG 无透明通道，铺白底
      ctx.drawImage(img, 0, 0, w, h);

      const quality = +qRange.value / 100;
      let blob = await new Promise(res => canvas.toBlob(res, fmt, fmt === 'image/png' ? undefined : quality));
      if (!blob && fmt !== 'image/png') { // 个别浏览器不支持 WebP 编码时回退 PNG
        fmt = 'image/png';
        blob = await new Promise(res => canvas.toBlob(res, fmt));
        toast('当前浏览器不支持该格式编码，已回退为 PNG');
      }
      if (!blob) throw new Error('编码失败');

      const base = file.name.replace(/\.[^.]+$/, '');
      const outName = `${base}_out.${EXT[fmt] || 'png'}`;
      return {
        blob, name: outName, width: w, height: h,
        fmtName: (EXT[fmt] || 'png').toUpperCase(),
        thumb: canvas.toDataURL('image/png', 0.6)
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  initWatermarkCard();
  initRemovebgTool();
}

/* ============ 图片水印（Canvas 叠加绘制） ============ */
function initWatermarkCard() {
  const drop = $('#wm-drop'), input = $('#wm-file');
  const typeSel = $('#wm-type'), textOpts = $('#wm-text-opts'), imageOpts = $('#wm-image-opts');
  const textIn = $('#wm-text'), sizeIn = $('#wm-size'), colorIn = $('#wm-color');
  const rotateIn = $('#wm-rotate'), rVal = $('#wm-r-val');
  const imgPick = $('#wm-img-pick'), imgFile = $('#wm-img-file'), imgName = $('#wm-img-name');
  const scaleIn = $('#wm-scale'), sVal = $('#wm-s-val');
  const opacityIn = $('#wm-opacity'), oVal = $('#wm-o-val'), posSel = $('#wm-pos'), fmtSel = $('#wm-format');
  const previewWrap = $('#wm-preview-wrap'), previewImg = $('#wm-preview-img');
  const list = $('#wm-list'), applyBtn = $('#wm-apply'), zipBtn = $('#wm-zip'), clearBtn = $('#wm-clear');

  let items = [];     // { file, status, error, result: { blob, name, url, thumb } }
  let wmImage = null; // 水印图片
  let gen = 0;        // 处理代际：参数变化时放弃旧的异步处理
  let debounceTimer = null;

  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法解码该图片')); };
      img.src = url;
    });
  }

  /* 九宫格定位：pos 形如 'tl' / 'mc' / 'br' */
  function gridPos(pos, w, h, ow, oh, m) {
    const xs = { l: m, c: (w - ow) / 2, r: w - ow - m };
    const ys = { t: m, c: (h - oh) / 2, b: h - oh - m };
    return [xs[pos[1]], ys[pos[0]]];
  }

  function renderWatermark(img) {
    const w = img.naturalWidth || 1024, h = img.naturalHeight || 1024;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    ctx.globalAlpha = Math.max(0.05, +opacityIn.value / 100);
    const pos = posSel.value;

    if (typeSel.value === 'text') {
      const text = textIn.value || '水印';
      const size = Math.max(8, +sizeIn.value || 28);
      ctx.font = `600 ${size}px system-ui, "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = colorIn.value;
      ctx.textBaseline = 'top';
      const tw = Math.max(1, ctx.measureText(text).width), th = size;
      const rotate = +rotateIn.value;
      if (pos === 'tile') {
        const stepX = tw + Math.max(60, w * 0.08), stepY = th + Math.max(70, h * 0.1);
        ctx.translate(w / 2, h / 2);
        ctx.rotate(rotate * Math.PI / 180);
        ctx.translate(-w / 2, -h / 2);
        for (let y = -h; y < h * 2; y += stepY)
          for (let x = -w; x < w * 2; x += stepX)
            ctx.fillText(text, x, y);
      } else {
        const m = Math.round(Math.min(w, h) * 0.04);
        const [px, py] = gridPos(pos, w, h, tw, th, m);
        if (rotate) {
          ctx.translate(px + tw / 2, py + th / 2);
          ctx.rotate(rotate * Math.PI / 180);
          ctx.translate(-(px + tw / 2), -(py + th / 2));
        }
        ctx.fillText(text, px, py);
      }
    } else if (wmImage) {
      const scale = Math.max(1, +scaleIn.value || 20) / 100;
      const ww = Math.max(24, Math.round(w * scale));
      const wh = Math.max(24, Math.round(ww * wmImage.naturalHeight / wmImage.naturalWidth));
      if (pos === 'tile') {
        const stepX = ww + Math.max(40, w * 0.05), stepY = wh + Math.max(40, h * 0.05);
        for (let y = 12; y < h; y += stepY)
          for (let x = 12; x < w; x += stepX)
            ctx.drawImage(wmImage, x, y, ww, wh);
      } else {
        const m = Math.round(Math.min(w, h) * 0.04);
        const [px, py] = gridPos(pos, w, h, ww, wh, m);
        ctx.drawImage(wmImage, px, py, ww, wh);
      }
    }
    return canvas;
  }

  function renderList() {
    list.innerHTML = '';
    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'result-row';
      const meta = it.result
        ? `${it.file.name} → ${it.result.name} · ${formatBytes(it.result.blob.size)}`
        : (it.error ? `<span class="cost">失败：${escapeHtml(it.error || '')}</span>` : '处理中…');
      row.innerHTML = `
        ${it.result?.thumb ? `<img class="thumb" src="${it.result.thumb}" alt="">` : '<div class="thumb"></div>'}
        <div class="r-main"><div class="r-meta">${meta}</div></div>`;
      if (it.result) {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = '下载';
        btn.addEventListener('click', () => downloadBlob(it.result.blob, it.result.name));
        row.appendChild(btn);
      }
      const del = document.createElement('button');
      del.className = 'row-btn';
      del.textContent = '✕';
      del.addEventListener('click', () => { items.splice(idx, 1); processAll(); });
      row.appendChild(del);
      list.appendChild(row);
    });
    applyBtn.disabled = !items.length;
    zipBtn.disabled = !items.some(i => i.result);
    const first = items.find(i => i.result);
    if (first) {
      previewWrap.hidden = false;
      previewImg.src = first.result.url;
    } else {
      previewWrap.hidden = true;
    }
  }

  let processing = false;
  async function processAll() {
    if (!items.length || processing) { renderList(); return; }
    const myGen = ++gen;
    processing = true;
    applyBtn.disabled = true; zipBtn.disabled = true;
    for (const it of items) {
      if (myGen !== gen) { processing = false; return; } // 参数已变化，本轮作废
      if (typeSel.value === 'image' && !wmImage) {
        it.result = null; it.error = '请先选择水印图';
        renderList();
        continue;
      }
      try {
        const { img, url } = await loadImage(it.file);
        const canvas = renderWatermark(img);
        URL.revokeObjectURL(url);
        const mime = fmtSel.value;
        const blob = await new Promise(res => canvas.toBlob(res, mime, mime === 'image/png' ? undefined : 0.92));
        if (!blob) throw new Error('图片编码失败');
        const ext = EXT[mime] || 'png';
        it.result = {
          blob,
          name: it.file.name.replace(/\.[^.]+$/, '') + '_wm.' + ext,
          url: URL.createObjectURL(blob),
          thumb: canvas.toDataURL('image/png')
        };
        it.error = null;
      } catch (e) {
        it.result = null;
        it.error = e.message;
      }
      renderList();
    }
    processing = false;
    applyBtn.disabled = !items.length;
    zipBtn.disabled = !items.some(i => i.result);
    const first = items.find(i => i.result);
    if (first) { previewWrap.hidden = false; previewImg.src = first.result.url; }
  }

  function scheduleReprocess() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processAll, 300);
  }

  /* 输入联动 */
  typeSel.addEventListener('change', () => {
    textOpts.hidden = typeSel.value !== 'text';
    imageOpts.hidden = typeSel.value !== 'image';
    scheduleReprocess();
  });
  [textIn, sizeIn, colorIn, rotateIn, scaleIn, opacityIn, posSel, fmtSel].forEach(el => el.addEventListener('input', scheduleReprocess));
  rotateIn.addEventListener('input', () => { rVal.textContent = rotateIn.value; });
  scaleIn.addEventListener('input', () => { sVal.textContent = scaleIn.value; });
  opacityIn.addEventListener('input', () => { oVal.textContent = opacityIn.value; });

  imgPick.addEventListener('click', () => imgFile.click());
  imgFile.addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const { img, url } = await new Promise((resolve, reject) => {
      const u = URL.createObjectURL(f);
      const im = new Image();
      im.onload = () => resolve({ img: im, url: u });
      im.onerror = () => reject(new Error('水印图读取失败'));
      im.src = u;
    }).catch(err => { toast(err.message, 'error'); return {}; });
    if (!img) return;
    URL.revokeObjectURL(url);
    wmImage = img;
    imgName.textContent = `已选择：${f.name}（${img.naturalWidth}×${img.naturalHeight}）`;
    scheduleReprocess();
  });

  /* 添加图片 */
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  function addFiles(fileList) {
    const imgs = [...fileList].filter(f => f.type.startsWith('image/'));
    if (!imgs.length) { toast('请选择图片文件', 'error'); return; }
    imgs.forEach(f => items.push({ file: f, result: null, error: null }));
    processAll();
  }

  applyBtn.addEventListener('click', processAll);
  zipBtn.addEventListener('click', () => {
    const done = items.filter(i => i.result);
    if (!done.length) return;
    downloadZip(done.map(i => ({ name: i.result.name, blob: i.result.blob })), 'watermarked.zip');
  });
  clearBtn.addEventListener('click', () => {
    items.forEach(i => i.result && URL.revokeObjectURL(i.result.url));
    items = [];
    renderList();
  });
}
