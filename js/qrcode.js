/* ============ 二维码工具：生成（qrcode.js） + 识别（jsQR） ============ */
Toolbox.register({
  id: 'qrcode',
  name: '二维码工具',
  icon: '🔳',
  desc: '生成二维码（尺寸 / 纠错级别 / 颜色自定义，导出带安静区的高清 PNG），并识别图片中的二维码（jsQR 本地解码，支持粘贴截图）。',
  init: initQrcodeTool
});

function initQrcodeTool() {
  initQrGenerate();
  initQrDecode();
}

/* ==================== 生成 ==================== */
function initQrGenerate() {
  const textEl = $('#qr-text'), sizeSel = $('#qr-size'), ecSel = $('#qr-ec');
  const darkIn = $('#qr-dark'), lightIn = $('#qr-light');
  const out = $('#qr-out'), hint = $('#qr-hint'), dlBtn = $('#qr-download');
  let canvas = null, timer = null;

  function clear() {
    out.innerHTML = '';
    canvas = null;
    dlBtn.disabled = true;
    hint.hidden = false;
  }

  function render() {
    const text = textEl.value;
    if (!text.trim()) { clear(); return; }
    try {
      // 用 qrcode.js 完成编码，读取其 QR 模型后自绘：
      // 按"每模块整数像素"绘制保证清晰，并补上 4 模块宽的安静区（留白）。
      const holder = document.createElement('div');
      holder.style.display = 'none';
      document.body.appendChild(holder);
      const inst = new QRCode(holder, {
        text,
        width: 256, height: 256,
        colorDark: darkIn.value, colorLight: lightIn.value,
        correctLevel: QRCode.CorrectLevel[ecSel.value]
      });
      const model = inst._oQRCode;
      const modules = model.getModuleCount();

      const size = +sizeSel.value;
      const cell = Math.max(1, Math.floor(size / (modules + 8))); // 两侧各留 4 模块
      const quiet = cell * 4;
      const total = cell * modules + quiet * 2;

      const cv = document.createElement('canvas');
      cv.width = cv.height = total;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = lightIn.value;
      ctx.fillRect(0, 0, total, total);
      ctx.fillStyle = darkIn.value;
      for (let r = 0; r < modules; r++) {
        for (let c = 0; c < modules; c++) {
          if (model.isDark(r, c)) ctx.fillRect(quiet + c * cell, quiet + r * cell, cell, cell);
        }
      }
      holder.remove();

      out.innerHTML = '';
      cv.style.maxWidth = '300px';
      cv.style.height = 'auto';
      out.appendChild(cv);
      canvas = cv;
      hint.hidden = true;
      dlBtn.disabled = false;
    } catch (e) {
      console.error(e);
      clear();
      hint.textContent = '生成失败：' + e.message + '（内容可能过长）';
    }
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(render, 250);
  };

  [textEl, sizeSel, ecSel, darkIn, lightIn].forEach(el => el.addEventListener('input', schedule));

  dlBtn.addEventListener('click', () => {
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (blob) { downloadBlob(blob, 'qrcode.png'); toast('已下载 qrcode.png', 'success'); }
    }, 'image/png');
  });
}

/* ==================== 识别 ==================== */
function initQrDecode() {
  const drop = $('#qd-drop'), input = $('#qd-file');
  const preview = $('#qd-preview'), img = $('#qd-img');
  const resultBox = $('#qd-result'), resultText = $('#qd-text');
  const copyBtn = $('#qd-copy'), openBtn = $('#qd-open'), toGenBtn = $('#qd-to-gen');
  const hint = $('#qd-hint');

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { decodeFile(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    decodeFile(e.dataTransfer.files[0]);
  });

  // 本视图可见时，支持直接 Ctrl+V 粘贴截图（不干扰其他页面的输入框）
  document.addEventListener('paste', e => {
    if (currentRoute() !== 'qrcode') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      decodeFile(item.getAsFile(), '剪贴板图片');
    }
  });

  function showHint(text, ok = false) {
    hint.hidden = false;
    hint.className = 'file-chip' + (ok ? ' ok' : '');
    hint.textContent = text;
  }

  function decodeFile(file, fallbackName = '图片') {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('请选择图片文件', 'error'); return; }
    const name = file.name || fallbackName;
    showHint('识别中…');

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      preview.hidden = false;
      img.src = url;
      try {
        // 过大的图等比缩小，过小的图放大，均衡解码成功率与内存
        let w = image.naturalWidth, h = image.naturalHeight;
        let scale = Math.min(1, 1600 / Math.max(w, h));
        if (Math.max(w, h) < 300) scale = Math.min(4, 300 / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });

        if (code && code.data) {
          resultBox.hidden = false;
          resultText.value = code.data;
          const isUrl = /^https?:\/\//i.test(code.data.trim());
          openBtn.hidden = !isUrl;
          openBtn.onclick = () => window.open(code.data.trim(), '_blank', 'noopener');
          copyBtn.onclick = () => copyText(code.data);
          toGenBtn.onclick = () => {
            const gen = document.querySelector('#qr-text');
            gen.value = code.data;
            gen.dispatchEvent(new Event('input', { bubbles: true }));
            document.querySelector('#qr-text').closest('.card').scrollIntoView({ behavior: 'smooth' });
            toast('已填入生成工具', 'success');
          };
          showHint(`✓ 识别成功（${name}，${image.naturalWidth}×${image.naturalHeight}）`, true);
          toast('识别成功', 'success');
        } else {
          resultBox.hidden = true;
          showHint(`✕ 未识别到二维码（${name}）。请试试更清晰的截图：保证二维码完整、清晰、无明显反光和倾斜。`);
        }
      } catch (e) {
        console.error(e);
        showHint('✕ 解码出错：' + e.message);
      }
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showHint('✕ 无法读取该图片文件');
    };
    image.src = url;
  }
}
