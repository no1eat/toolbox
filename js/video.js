/* ============ 视频工具：转 GIF（omggif） + 帧提取 ============ */
Toolbox.register({
  id: 'video',
  name: '视频工具',
  icon: '🎬',
  desc: '视频转 GIF（截取片段、帧率与尺寸可调、256 色量化）与视频帧提取（时间轴精确截图、缩略图网格、ZIP 打包），全部本地处理。',
  init: initVideoTool
});

function initVideoTool() {
  /* 两个卡片共用同一个视频文件 */
  let videoFile = null;
  const gfVideo = $('#gf-video');

  /* ---------- 通用 ---------- */
  function seekTo(video, t) {
    return new Promise(resolve => {
      const target = Math.max(0, Math.min(t, (video.duration || 0) - 0.05));
      const done = () => { video.removeEventListener('seeked', done); resolve(); };
      video.addEventListener('seeked', done);
      video.currentTime = target;
    });
  }

  function bindDrop(dropSel, inputSel, handler) {
    const drop = $(dropSel), input = $(inputSel);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { handler(input.files[0]); input.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      handler(e.dataTransfer.files[0]);
    });
  }

  function isVideo(file) {
    return file && (file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(file.name));
  }

  async function loadSharedVideo(file) {
    if (videoFile) URL.revokeObjectURL(videoFile.objectUrl);
    const url = URL.createObjectURL(file);
    videoFile = { file, objectUrl: url, name: file.name };
    gfVideo.src = url;
    gfVideo.hidden = false;
    await new Promise(resolve => {
      gfVideo.addEventListener('loadedmetadata', resolve, { once: true });
    });
    $('#gf-info').hidden = false;
    $('#gf-info').textContent = `已载入：${file.name} · ${gfVideo.videoWidth}×${gfVideo.videoHeight} · ${gfVideo.duration.toFixed(1)} 秒`;
    $('#gf-run').disabled = false;
    $('#fe-run').disabled = false;
    $('#fe-info').textContent = `已载入：${file.name}（${gfVideo.duration.toFixed(1)} 秒）`;
  }

  bindDrop('#gf-drop', '#gf-file', async file => {
    if (!isVideo(file)) { toast('请选择视频文件', 'error'); return; }
    try { await loadSharedVideo(file); } catch (e) { toast('视频载入失败：' + e.message, 'error'); }
  });

  /* ==================== 视频转 GIF ==================== */
  const gfStart = $('#gf-start'), gfEnd = $('#gf-end');
  const gfFps = $('#gf-fps'), gfWidth = $('#gf-width'), gfColors = $('#gf-colors');
  const gfEstimate = $('#gf-estimate'), gfRun = $('#gf-run'), gfDownload = $('#gf-download');
  const gfProgress = $('#gf-progress'), gfProgressText = $('#gf-progress-text'), gfBar = $('#gf-bar');
  const gfResult = $('#gf-result'), gfImg = $('#gf-img');
  let gifBlob = null, gifName = 'animation.gif';

  function updateEstimate() {
    if (!videoFile) { gfEstimate.textContent = '预计帧数：—'; return; }
    const s = Math.max(0, +gfStart.value || 0);
    const e = Math.min(gfVideo.duration || +gfEnd.value || 3, +gfEnd.value || 3);
    const fps = +gfFps.value;
    const frames = Math.max(0, Math.ceil((e - s) * fps));
    let width = +gfWidth.value;
    if (!width) width = gfVideo.videoWidth || 480;
    const height = Math.round(width * (gfVideo.videoHeight || 360) / (gfVideo.videoWidth || 640) / 2) * 2;
    gfEstimate.textContent = `预计帧数：${frames} 帧（${width}×${height}，时长 ${(e - s).toFixed(1)} 秒）` +
      (frames > 500 ? ' ⚠️ 帧数过多，建议缩短片段或降低帧率' : '');
  }
  [gfStart, gfEnd, gfFps, gfWidth].forEach(el => el.addEventListener('input', updateEstimate));

  gfVideo.addEventListener('seeked', () => {
    if (Number.isFinite(gfVideo.duration)) {
      // 播放位置变化时同步估计（不覆盖用户手输的值，只更新提示）
    }
  });
  $('#gf-set-start').addEventListener('click', () => { gfStart.value = gfVideo.currentTime.toFixed(1); updateEstimate(); });
  $('#gf-set-end').addEventListener('click', () => { gfEnd.value = gfVideo.currentTime.toFixed(1); updateEstimate(); });

  /* 中位切分法量化：从采样像素构建 maxColors 色调色板 */
  function medianCutPalette(pixels, maxColors) {
    // pixels: [r,g,b] 采样数组
    let boxes = [pixels];
    while (boxes.length < maxColors) {
      let best = -1, bestScore = -1, bestCh = 0;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        for (let ch = 0; ch < 3; ch++) {
          let min = 255, max = 0;
          for (const p of box) { const v = p[ch]; if (v < min) min = v; if (v > max) max = v; }
          const score = (max - min) * Math.log(box.length);
          if (score > bestScore) { bestScore = score; best = i; bestCh = ch; }
        }
      });
      if (best < 0) break;
      const box = boxes[best];
      box.sort((a, b) => a[bestCh] - b[bestCh]);
      const mid = box.length >> 1;
      boxes.splice(best, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(box => {
      let r = 0, g = 0, b = 0;
      for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
      const n = box.length || 1;
      // omggif 的调色板项为 0xRRGGBB 整数
      return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
    });
  }

  function nearestIndexMap(palette) {
    // 以 RGB 5bit/通道为键缓存最近色映射，大幅加速逐像素映射
    const map = new Map();
    return (r, g, b) => {
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let idx = map.get(key);
      if (idx === undefined) {
        let best = 0, bestD = Infinity;
        for (let i = 0; i < palette.length; i++) {
          const p = palette[i];
          const dr = r - p[0], dg = g - p[1], db = b - p[2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestD) { bestD = dist; best = i; }
        }
        idx = best;
        map.set(key, idx);
      }
      return idx;
    };
  }

  gfRun.addEventListener('click', async () => {
    if (!videoFile) return;
    const start = Math.max(0, +gfStart.value || 0);
    const end = Math.min(gfVideo.duration || 3, +gfEnd.value || 3);
    const fps = +gfFps.value;
    if (end <= start) { toast('结束时间需大于开始时间', 'error'); return; }
    let width = +gfWidth.value;
    if (!width) width = gfVideo.videoWidth || 480;
    width = Math.min(width, gfVideo.videoWidth || width);
    const height = Math.max(2, Math.round(width * (gfVideo.videoHeight || 360) / (gfVideo.videoWidth || 640) / 2) * 2);
    const frameCount = Math.ceil((end - start) * fps);
    const maxColors = +gfColors.value;
    if (frameCount > 600) { toast('帧数过多（' + frameCount + '），请缩短片段或降低帧率', 'error'); return; }

    gfRun.disabled = true;
    gfDownload.disabled = true;
    gfProgress.hidden = false;
    const setProgress = (text, ratio) => {
      gfProgressText.textContent = text;
      gfBar.style.width = Math.round(ratio * 100) + '%';
    };

    try {
      gfVideo.pause();
      const outCanvas = document.createElement('canvas');
      outCanvas.width = width; outCanvas.height = height;
      const octx = outCanvas.getContext('2d', { willReadFrequently: true });

      // 1) 逐帧提取（seek 保证时间精确）
      const frames = [];
      for (let i = 0; i < frameCount; i++) {
        await seekTo(gfVideo, start + i / fps);
        octx.drawImage(gfVideo, 0, 0, width, height);
        frames.push(octx.getImageData(0, 0, width, height).data);
        setProgress(`提取帧 ${i + 1} / ${frameCount}…`, (i + 1) / frameCount);
      }

      // 2) 全局调色板（跨帧采样，中位切分）
      setProgress('正在构建调色板…', 0);
      const samples = [];
      const step = Math.max(4, Math.floor(width * height / 4000)) * 4;
      for (const f of frames) {
        for (let i = 0; i < f.length; i += step) samples.push([f[i], f[i + 1], f[i + 2]]);
      }
      const palette = medianCutPalette(samples, maxColors);

      // 3) 逐帧映射为索引色并编码
      const toIdx = nearestIndexMap(palette);
      const buf = new Uint8Array(frames.length * (width * height + 1400) + 100000);
      const writer = new GifWriter(buf, width, height, { loop: 0, palette });
      const delay = Math.max(2, Math.round(100 / fps));
      const indexed = new Uint8Array(width * height);
      for (let n = 0; n < frames.length; n++) {
        const f = frames[n];
        for (let i = 0, p = 0; i < f.length; i += 4, p++) {
          indexed[p] = toIdx(f[i], f[i + 1], f[i + 2]);
        }
        writer.addFrame(0, 0, width, height, indexed, { delay });
        setProgress(`编码帧 ${n + 1} / ${frames.length}…`, 0.5 + (n + 1) / frames.length * 0.5);
      }
      gifBlob = new Blob([buf.subarray(0, writer.end())], { type: 'image/gif' });
      gifName = videoFile.name.replace(/\.[^.]+$/, '') + '.gif';
      gfImg.src = URL.createObjectURL(gifBlob);
      gfResult.hidden = false;
      gfDownload.disabled = false;
      setProgress(`完成！${width}×${height} · ${frames.length} 帧 · ${formatBytes(gifBlob.size)}`, 1);
      toast('GIF 生成完成', 'success');
    } catch (e) {
      console.error(e);
      setProgress('失败：' + e.message);
      toast('转换失败：' + e.message, 'error');
    }
    gfRun.disabled = false;
  });

  gfDownload.addEventListener('click', () => {
    if (gifBlob) downloadBlob(gifBlob, gifName);
  });

  /* ==================== 视频帧提取 ==================== */
  const feMode = $('#fe-mode'), feN = $('#fe-n'), feNLabel = $('#fe-n-label');
  const feStart = $('#fe-start'), feEnd = $('#fe-end'), feFormat = $('#fe-format'), feWidth = $('#fe-width');
  const feRun = $('#fe-run'), feZip = $('#fe-zip'), feInfo = $('#fe-info'), feGrid = $('#fe-grid');
  let frameFiles = []; // { name, blob }

  feMode.addEventListener('change', () => {
    feNLabel.textContent = feMode.value === 'interval' ? '间隔 秒' : '帧数';
    if (feMode.value === 'count') feN.value = 10; else feN.value = 1;
  });

  feRun.addEventListener('click', async () => {
    if (!videoFile || !Number.isFinite(gfVideo.duration)) { toast('请先在上方载入视频', 'error'); return; }
    const duration = gfVideo.duration;
    const start = Math.max(0, +feStart.value || 0);
    const end = Math.min(duration, +feEnd.value || duration);
    if (end <= start) { toast('结束时间需大于开始时间', 'error'); return; }
    const n = Math.max(0.1, +feN.value || 1);
    const times = [];
    if (feMode.value === 'interval') {
      for (let t = start; t <= end + 1e-6 && times.length < 500; t += n) times.push(t);
    } else {
      const count = Math.min(500, Math.max(1, Math.floor(n)));
      for (let i = 0; i < count; i++) times.push(start + (end - start) * (count === 1 ? 0.5 : i / (count - 1)));
    }
    const width = Math.max(40, Math.min(3840, +feWidth.value || 480));
    const height = Math.round(width * (gfVideo.videoHeight || 360) / (gfVideo.videoWidth || 640));
    const fmt = feFormat.value, ext = fmt === 'image/png' ? 'png' : 'jpg';

    feRun.disabled = true; feZip.disabled = true;
    feGrid.innerHTML = '';
    frameFiles = [];
    feInfo.textContent = '提取中…';
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    try {
      gfVideo.pause();
      for (let i = 0; i < times.length; i++) {
        await seekTo(gfVideo, times[i]);
        ctx.drawImage(gfVideo, 0, 0, width, height);
        const blob = await new Promise(res => canvas.toBlob(res, fmt, fmt === 'image/jpeg' ? 0.92 : undefined));
        const name = `frame_${String(i + 1).padStart(3, '0')}_t${times[i].toFixed(2)}s.${ext}`;
        frameFiles.push({ name, blob });
        feInfo.textContent = `提取中 ${i + 1} / ${times.length}…`;
        // 缩略图
        const item = document.createElement('div');
        item.className = 'thumb-item';
        const img = document.createElement('img');
        img.src = URL.createObjectURL(blob);
        const label = document.createElement('div');
        label.className = 't-label';
        label.textContent = `${times[i].toFixed(2)}s · ${formatBytes(blob.size)}`;
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = '下载';
        btn.addEventListener('click', () => downloadBlob(blob, name));
        item.append(img, label, btn);
        feGrid.appendChild(item);
      }
      feZip.disabled = frameFiles.length < 1;
      feInfo.textContent = `完成：共 ${frameFiles.length} 帧`;
      toast('帧提取完成', 'success');
    } catch (e) {
      console.error(e);
      feInfo.textContent = '失败：' + e.message;
      toast('提取失败：' + e.message, 'error');
    }
    feRun.disabled = false;
  });

  feZip.addEventListener('click', () => {
    if (frameFiles.length) downloadZip(frameFiles, 'frames.zip');
  });
}
