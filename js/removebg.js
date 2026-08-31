/* ============ 图片去背景（@imgly/background-removal，浏览器本地 AI 推理） ============
 * 作为「图片工具」视图中的卡片存在（由 image.js 的 initImageTool 调用 initRemovebgTool）。
 * 模型（约 40–80 MB）运行时从官方 CDN 分块下载，仅存于页面内存与浏览器 HTTP 缓存。
 * 持久化的三种改造方案见 README「图片去背景：模型缓存的三种方案」。 */
function initRemovebgTool() {
  const drop = $('#rb-drop'), input = $('#rb-file');
  const modelSel = $('#rb-model'), outSel = $('#rb-out');
  const statusBox = $('#rb-status'), statusText = $('#rb-status-text'), barFill = $('#rb-bar-fill');
  const preview = $('#rb-preview'), srcImg = $('#rb-src-img'), outImg = $('#rb-out-img');
  const runBtn = $('#rb-run'), downloadBtn = $('#rb-download'), clearBtn = $('#rb-clear');
  let currentFile = null, srcUrl = null, resultBlob = null, resultName = '';

  /* 引擎按需从 CDN 以 ES Module 动态导入（模型权重随后也从官方 CDN 加载并缓存） */
  const ENGINE_URLS = [
    'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm',
    'https://esm.sh/@imgly/background-removal@1.7.0'
  ];
  let enginePromise = null;
  function loadEngine() {
    if (!enginePromise) {
      enginePromise = (async () => {
        let lastErr = null;
        for (const url of ENGINE_URLS) {
          try {
            setStatus('正在加载 AI 引擎…');
            return await import(url);
          } catch (e) { lastErr = e; }
        }
        enginePromise = null;
        throw new Error('AI 引擎加载失败，请检查网络连接（' + (lastErr?.message || '未知错误') + '）');
      })();
    }
    return enginePromise;
  }

  function setStatus(text, ratio = -1) {
    statusBox.hidden = false;
    statusText.textContent = text;
    if (ratio < 0) {
      barFill.style.width = '100%';
      barFill.style.animation = 'rb-indet 1.2s ease-in-out infinite alternate';
    } else {
      barFill.style.animation = 'none';
      barFill.style.width = Math.round(ratio * 100) + '%';
    }
  }
  function hideStatus() {
    statusBox.hidden = true;
    barFill.style.animation = 'none';
    barFill.style.width = '0';
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { pickFile(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    pickFile(e.dataTransfer.files[0]);
  });

  function pickFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('请选择图片文件', 'error'); return; }
    currentFile = file;
    if (srcUrl) URL.revokeObjectURL(srcUrl);
    srcUrl = URL.createObjectURL(file);
    srcImg.src = srcUrl;
    preview.hidden = false;
    outImg.removeAttribute('src');
    resultBlob = null;
    downloadBtn.disabled = true;
    runBtn.disabled = false;
    hideStatus();
  }

  runBtn.addEventListener('click', async () => {
    if (!currentFile) return;
    runBtn.disabled = true;
    downloadBtn.disabled = true;
    try {
      const mod = await loadEngine();
      setStatus('正在初始化模型（首次使用会先下载，请耐心等待）…');
      let lastKey = '';
      const blob = await mod.removeBackground(currentFile, {
        model: modelSel.value,
        proxyToWorker: false, // 主线程推理，兼容 file:// 直开环境
        progress: (key, cur, total) => {
          if (key !== lastKey) { lastKey = key; }
          if (key.startsWith('fetch')) {
            setStatus(`正在下载 AI 模型资源… ${cur}/${total}`, total ? cur / total : -1);
          } else {
            setStatus(`AI 推理中（${key} ${cur}/${total}），大图可能需要一些时间…`, total ? cur / total : -1);
          }
        }
      });
      setStatus('后处理中…');
      let out = blob, ext = 'png', mime = 'image/png';
      if (outSel.value === 'white') {
        const bmp = await createImageBitmap(blob);
        const c = document.createElement('canvas');
        c.width = bmp.width; c.height = bmp.height;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(bmp, 0, 0);
        bmp.close();
        out = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.92));
        ext = 'jpg'; mime = 'image/jpeg';
      }
      if (!out) throw new Error('图片编码失败');
      resultBlob = out;
      resultName = currentFile.name.replace(/\.[^.]+$/, '') + '_nobg.' + ext;
      outImg.src = URL.createObjectURL(out);
      downloadBtn.disabled = false;
      setStatus('完成！', 1);
      setTimeout(hideStatus, 1200);
      toast('去背景完成', 'success');
    } catch (e) {
      console.error(e);
      setStatus('失败：' + e.message);
      toast('去背景失败：' + e.message, 'error');
    }
    runBtn.disabled = false;
  });

  downloadBtn.addEventListener('click', () => {
    if (resultBlob) downloadBlob(resultBlob, resultName);
  });

  clearBtn.addEventListener('click', () => {
    currentFile = null; resultBlob = null;
    if (srcUrl) { URL.revokeObjectURL(srcUrl); srcUrl = null; }
    srcImg.removeAttribute('src');
    outImg.removeAttribute('src');
    preview.hidden = true;
    runBtn.disabled = true;
    downloadBtn.disabled = true;
    hideStatus();
  });
}
