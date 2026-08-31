/* ============ 音频工具：可视化（Web Audio） + 剪辑器（裁剪/淡化/拼接/变速） ============ */
Toolbox.register({
  id: 'audio',
  name: '音频工具',
  icon: '🎵',
  desc: 'Winamp 风格音频可视化（频谱 / 波形）与音频剪辑器：波形选区裁剪、淡入淡出、拼接、变速不变调，导出 WAV / MP3。',
  init: initAudioTool
});

function initAudioTool() {
  initAudioViz();
  initAudioEditor();
}

/* 全站共用一个 AudioContext（懒创建） */
let sharedCtx = null;
function audioCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sharedCtx;
}

function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/* ==================== 音频可视化 ==================== */
function initAudioViz() {
  const drop = $('#av-drop'), input = $('#av-file');
  const info = $('#av-info'), canvas = $('#av-canvas');
  const modeSel = $('#av-mode'), volumeIn = $('#av-volume');
  const playBtn = $('#av-play'), seekIn = $('#av-seek'), timeEl = $('#av-time');
  const audioEl = new Audio();

  let ctx = null, srcNode = null, gainNode = null, analyser = null;
  let freqData = null, timeData = null;
  let currentUrl = null, loaded = false;
  const peaks = new Float32Array(96); // 频谱峰值保持

  function ensureGraph() {
    if (ctx) return;
    ctx = audioCtx();
    srcNode = ctx.createMediaElementSource(audioEl);
    gainNode = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    timeData = new Uint8Array(analyser.fftSize);
    srcNode.connect(gainNode).connect(analyser).connect(ctx.destination);
  }

  function loadFile(file) {
    ensureGraph();
    if (ctx.state === 'suspended') ctx.resume();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(file);
    audioEl.src = currentUrl;
    loaded = true;
    playBtn.disabled = false;
    info.hidden = false;
    info.textContent = `已载入：${file.name}（${formatBytes(file.size)}）`;
    toast('已载入，点击播放', 'success');
  }

  playBtn.addEventListener('click', () => {
    if (!loaded) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (audioEl.paused) audioEl.play();
    else audioEl.pause();
  });
  audioEl.addEventListener('play', () => { playBtn.textContent = '⏸ 暂停'; });
  audioEl.addEventListener('pause', () => { playBtn.textContent = '▶ 播放'; });
  audioEl.addEventListener('ended', () => { playBtn.textContent = '▶ 播放'; });

  seekIn.addEventListener('input', () => {
    if (Number.isFinite(audioEl.duration)) {
      audioEl.currentTime = (seekIn.value / 1000) * audioEl.duration;
    }
  });
  audioEl.addEventListener('timeupdate', () => {
    if (!Number.isFinite(audioEl.duration)) return;
    if (!seekDragging) seekIn.value = Math.round(audioEl.currentTime / audioEl.duration * 1000);
    timeEl.textContent = `${fmtTime(audioEl.currentTime)} / ${fmtTime(audioEl.duration)}`;
  });
  let seekDragging = false;
  seekIn.addEventListener('pointerdown', () => { seekDragging = true; });
  seekIn.addEventListener('pointerup', () => { seekDragging = false; });

  volumeIn.addEventListener('input', () => {
    if (gainNode) gainNode.gain.value = volumeIn.value / 100;
  });

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { if (input.files[0]) loadFile(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  /* 绘制循环 */
  let vizW = 0, vizH = 240, vizDpr = 1;
  function draw() {
    requestAnimationFrame(draw);
    const W = vizW, H = vizH;
    if (!W) return;
    const g = canvas.getContext('2d');
    g.setTransform(vizDpr, 0, 0, vizDpr, 0, 0); // 高分屏：内部分辨率 = CSS 尺寸 × dpr
    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue('--accent').trim() || '#4f6ef7';
    const accent2 = css.getPropertyValue('--accent-2').trim() || '#8b5cf6';
    const dim = css.getPropertyValue('--text-dim').trim() || '#888';

    g.clearRect(0, 0, W, H);
    if (!loaded || !analyser) {
      g.fillStyle = dim; g.font = '14px system-ui'; g.textAlign = 'center';
      g.fillText('载入音频后这里会出现频谱', W / 2, H / 2);
      return;
    }
    const mode = modeSel.value;
    const playing = !audioEl.paused;
    const spectrumH = mode === 'both' ? H * 0.62 : H;
    const waveY = mode === 'both' ? H * 0.62 : H / 2;

    if (mode !== 'wave') {
      analyser.getByteFrequencyData(freqData);
      const N = peaks.length;
      const bw = W / N;
      for (let i = 0; i < N; i++) {
        const bin = Math.min(freqData.length - 1, Math.floor(Math.pow(i / N, 1.5) * freqData.length * 0.72));
        const v = freqData[bin] / 255;
        const bh = v * (spectrumH - 14);
        const grad = g.createLinearGradient(0, spectrumH, 0, spectrumH - bh);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, accent2);
        g.fillStyle = grad;
        g.fillRect(i * bw + 1, spectrumH - bh, bw - 2, bh);
        // 峰值保持
        peaks[i] = Math.max(peaks[i] - 0.6, v * (spectrumH - 14));
        g.fillStyle = dim;
        g.fillRect(i * bw + 1, spectrumH - peaks[i] - 2, bw - 2, 2);
      }
    }
    if (mode !== 'bars') {
      analyser.getByteTimeDomainData(timeData);
      g.strokeStyle = accent;
      g.lineWidth = 2;
      g.beginPath();
      const amp = mode === 'both' ? (H - waveY) * 0.42 : H * 0.42;
      for (let i = 0; i < timeData.length; i++) {
        const x = (i / timeData.length) * W;
        const y = waveY + ((timeData[i] - 128) / 128) * amp * (playing ? 1 : 0.06);
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  requestAnimationFrame(draw);

  /* 画布尺寸自适应：CSS width:100% 决定显示宽度（永不超出卡片），
     内部分辨率 = 显示尺寸 × devicePixelRatio，保证高分屏清晰 */
  function fit() {
    vizH = 240;
    vizDpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    vizW = Math.max(200, Math.round(rect.width));
    canvas.width = Math.round(vizW * vizDpr);
    canvas.height = Math.round(vizH * vizDpr);
    canvas.style.height = vizH + 'px';
  }
  window.addEventListener('resize', fit);
  setTimeout(fit, 50);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 100));
}

/* ==================== 音频剪辑器 ==================== */
function initAudioEditor() {
  const drop = $('#ae-drop'), input = $('#ae-file');
  const info = $('#ae-info'), canvas = $('#ae-canvas'), selInfo = $('#ae-sel-info');
  const playToggle = $('#ae-play-toggle'), playSelBtn = $('#ae-play-sel'), playAllBtn = $('#ae-play-all');
  const cutBtn = $('#ae-cut'), delBtn = $('#ae-del'), undoBtn = $('#ae-undo'), resetBtn = $('#ae-reset');
  const fadeBtn = $('#ae-fade'), fadeinIn = $('#ae-fadein'), fadeoutIn = $('#ae-fadeout');
  const tempoIn = $('#ae-tempo'), tVal = $('#ae-t-val'), fmtSel = $('#ae-format'), exportBtn = $('#ae-export');

  const ctx = audioCtx();
  let original = null;   // 最初载入的 buffer（重置用）
  let buffer = null;     // 当前编辑中的 buffer
  let fileName = 'audio';
  let sel = null;        // { start, end } 秒
  let undoStack = [];
  let playSource = null, playStopAt = 0;

  const canPlay = () => !!buffer;
  const hasSel = () => !!sel && sel.end - sel.start > 0.01;

  function updateButtons() {
    playToggle.disabled = !canPlay();
    playToggle.textContent = playSource ? '⏸ 暂停' : (pausedAt !== null ? '▶ 继续播放' : '▶ 播放');
    playSelBtn.disabled = !(canPlay() && hasSel());
    playAllBtn.disabled = !canPlay();
    cutBtn.disabled = !hasSel();
    delBtn.disabled = !hasSel();
    fadeBtn.disabled = !canPlay();
    exportBtn.disabled = !canPlay();
    undoBtn.disabled = !undoStack.length;
    resetBtn.disabled = !original || buffer === original;
  }

  function pushUndo() {
    undoStack.push({ buffer: cloneBuffer(buffer), sel: sel ? { ...sel } : null });
    if (undoStack.length > 3) undoStack.shift();
    updateButtons();
  }

  function cloneBuffer(b) {
    const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c), c);
    return out;
  }

  function fmtInfo() {
    info.hidden = false;
    info.textContent = `当前：${fileName} · ${fmtTime(buffer.duration)} · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels === 1 ? '单声道' : '立体声'}`;
  }

  /* ---------- 波形绘制 ---------- */
  let peaksCache = null, peaksKey = '';
  function getPeaks(width) {
    const key = `${buffer.length}@${width}`;
    if (peaksKey === key && peaksCache) return peaksCache;
    const ch = buffer.numberOfChannels;
    const block = Math.max(1, Math.floor(buffer.length / width));
    const peaks = new Float32Array(width * 2);
    for (let x = 0; x < width; x++) {
      let min = 1, max = -1;
      const start = x * block, end = Math.min(start + block, buffer.length);
      const step = Math.max(1, Math.floor((end - start) / 50));
      for (let i = start; i < end; i += step) {
        for (let c = 0; c < ch; c++) {
          const v = buffer.getChannelData(c)[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      peaks[x * 2] = min; peaks[x * 2 + 1] = max;
    }
    peaksCache = peaks; peaksKey = key;
    return peaks;
  }

  function drawWave() {
    // 显示宽度由 CSS width:100% 决定（永不超出卡片），
    // 内部分辨率 = 显示尺寸 × devicePixelRatio，高分屏清晰
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(200, Math.round(rect.width));
    const H = 120;
    const tW = Math.round(W * dpr), tH = Math.round(H * dpr);
    if (canvas.width !== tW || canvas.height !== tH) {
      canvas.width = tW;
      canvas.height = tH;
      canvas.style.height = H + 'px';
    }
    if (!W || !buffer) return;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    g.clearRect(0, 0, W, H);
    const mid = H / 2;
    g.strokeStyle = css.getPropertyValue('--text-dim').trim() || '#888';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, mid); g.lineTo(W, mid); g.stroke();

    const peaks = getPeaks(W);
    g.fillStyle = css.getPropertyValue('--accent').trim() || '#4f6ef7';
    for (let x = 0; x < W; x++) {
      const y1 = mid - peaks[x * 2 + 1] * (H / 2 - 6);
      const y2 = mid - peaks[x * 2] * (H / 2 - 6);
      g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
    }
    if (hasSel()) {
      const x1 = sel.start / buffer.duration * W;
      const x2 = sel.end / buffer.duration * W;
      g.fillStyle = 'rgba(79, 111, 247, .18)';
      g.fillRect(x1, 0, x2 - x1, H);
      g.fillStyle = css.getPropertyValue('--accent').trim() || '#4f6ef7';
      g.fillRect(x1, 0, 2, H);
      g.fillRect(x2 - 2, 0, 2, H);
    }
    // 播放/暂停时都显示红色播放头
    if (buffer && (playSource || pausedAt !== null)) {
      const t = currentPos();
      const x = t / buffer.duration * W;
      g.fillStyle = '#e5484d';
      g.fillRect(Math.max(0, Math.min(W - 2, x)), 0, 2, H);
    }
  }

  function redraw() { drawWave(); selInfoUpdate(); updateButtons(); }

  function selInfoUpdate() {
    if (hasSel()) {
      selInfo.textContent = `已选 ${fmtTime(sel.start)} ~ ${fmtTime(sel.end)}（${(sel.end - sel.start).toFixed(2)} 秒）`;
    } else {
      selInfo.textContent = '在波形上拖动鼠标选择区域；单击取消选择。';
    }
  }

  /* ---------- 选区拖拽 ---------- */
  let dragging = false, dragStartX = 0;
  function xToTime(clientX) {
    const r = canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * buffer.duration;
  }
  canvas.addEventListener('mousedown', e => {
    if (!buffer) return;
    dragging = true;
    dragStartX = e.clientX;
    sel = { start: xToTime(e.clientX), end: xToTime(e.clientX) };
    redraw();
  });
  window.addEventListener('mousemove', e => {
    if (!dragging || !buffer) return;
    const t = xToTime(e.clientX);
    sel = { start: Math.min(xToTime(dragStartX), t), end: Math.max(xToTime(dragStartX), t) };
    selInfoUpdate();
    drawWave();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    if (!hasSel()) sel = null; // 单击：取消选择
    redraw();
  });

  /* ---------- 播放 / 暂停 / 停止 ---------- */
  let playOffset = 0, playStartCtx = 0;
  let playRange = null; // { start, dur } 本次播放的范围
  let pausedAt = null;  // 暂停位置（秒）

  function currentPos() {
    if (pausedAt !== null && !playSource) return pausedAt;
    return playOffset + (ctx.currentTime - playStartCtx);
  }

  function startPlay(offset) {
    if (playSource) { try { playSource.stop(); } catch {} playSource = null; } // 切换播放前先停掉当前源
    const dur = playRange ? playRange.start + playRange.dur - offset : buffer.duration - offset;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(0, offset, Math.max(0.01, dur));
    playSource = src;
    playOffset = offset;
    playStartCtx = ctx.currentTime;
    pausedAt = null;
    src.onended = () => {
      if (playSource === src) { playSource = null; pausedAt = null; playRange = null; }
      updateButtons(); redraw();
    };
    updateButtons();
    const loop = () => { if (playSource === src) { drawWave(); requestAnimationFrame(loop); } };
    requestAnimationFrame(loop);
  }

  function pausePlay() {
    pausedAt = currentPos();
    if (playSource) { try { playSource.stop(); } catch {} playSource = null; }
    updateButtons(); drawWave();
  }

  function stopAll() {
    pausedAt = null; playRange = null;
    if (playSource) { try { playSource.stop(); } catch {} playSource = null; }
    updateButtons(); drawWave();
  }

  playToggle.addEventListener('click', () => {
    if (!buffer) return;
    if (playSource) { pausePlay(); return; }               // 播放中 → 暂停
    if (pausedAt !== null) { startPlay(pausedAt); return; } // 暂停中 → 继续播放
    playRange = hasSel()
      ? { start: sel.start, dur: sel.end - sel.start }
      : { start: 0, dur: buffer.duration };
    startPlay(playRange.start);                             // 从头播放（有选区播选区）
  });
  playSelBtn.addEventListener('click', () => {
    if (!buffer || !hasSel()) return;
    playRange = { start: sel.start, dur: sel.end - sel.start };
    startPlay(sel.start);
  });
  playAllBtn.addEventListener('click', () => {
    if (!buffer) return;
    playRange = { start: 0, dur: buffer.duration };
    startPlay(0);
  });  playSelBtn.addEventListener('click', () => {
    if (!buffer || !hasSel()) return;
    playRange = { start: sel.start, dur: sel.end - sel.start };
    startPlay(sel.start);
  });
  playAllBtn.addEventListener('click', () => {
    if (!buffer) return;
    playRange = { start: 0, dur: buffer.duration };
    startPlay(0);
  });

  /* ---------- 裁剪 / 删除 ---------- */
  function sliceBuffer(b, s, e) {
    const sr = b.sampleRate, ch = b.numberOfChannels;
    const from = Math.floor(s * sr), to = Math.min(b.length, Math.floor(e * sr));
    const out = ctx.createBuffer(ch, Math.max(1, to - from), sr);
    for (let c = 0; c < ch; c++) {
      out.copyToChannel(b.getChannelData(c).subarray(from, to), c);
    }
    return out;
  }
  function concatBuffers(a, b) {
    const sr = a.sampleRate, ch = Math.max(a.numberOfChannels, b.numberOfChannels);
    const total = a.length + b.length;
    const out = ctx.createBuffer(ch, total, sr);
    for (let c = 0; c < ch; c++) {
      const da = a.getChannelData(Math.min(c, a.numberOfChannels - 1));
      const db = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
      out.getChannelData(c).set(da, 0);
      out.getChannelData(c).set(db, a.length);
    }
    return out;
  }

  cutBtn.addEventListener('click', () => {
    if (!hasSel()) return;
    pushUndo();
    stopAll();
    buffer = sliceBuffer(buffer, sel.start, sel.end);
    sel = null;
    peaksKey = '';
    fmtInfo(); redraw();
    toast('已裁剪', 'success');
  });
  delBtn.addEventListener('click', () => {
    if (!hasSel()) return;
    pushUndo();
    stopAll();
    const before = sliceBuffer(buffer, 0, sel.start);
    const after = sliceBuffer(buffer, sel.end, buffer.duration);
    buffer = concatBuffers(before, after);
    sel = null;
    peaksKey = '';
    fmtInfo(); redraw();
    toast('已删除选区', 'success');
  });

  /* ---------- 淡入淡出 ---------- */
  fadeBtn.addEventListener('click', () => {
    if (!buffer) return;
    pushUndo();
    const sr = buffer.sampleRate;
    const inSec = Math.max(0, +fadeinIn.value || 0);
    const outSec = Math.max(0, +fadeoutIn.value || 0);
    const inFrom = hasSel() ? Math.floor(sel.start * sr) : 0;
    const inTo = Math.min(buffer.length, inFrom + Math.floor(inSec * sr));
    const outTo = hasSel() ? Math.floor(sel.end * sr) : buffer.length;
    const outFrom = Math.max(0, outTo - Math.floor(outSec * sr));
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = inFrom; i < inTo; i++) d[i] *= (i - inFrom) / (inTo - inFrom);
      for (let i = outFrom; i < outTo; i++) d[i] *= (outTo - i) / (outTo - outFrom);
    }
    redraw();
    toast('已应用淡入淡出', 'success');
  });

  /* ---------- 撤销 / 重置 ---------- */
  undoBtn.addEventListener('click', () => {
    if (!undoStack.length) return;
    const s = undoStack.pop();
    buffer = s.buffer;
    sel = s.sel;
    peaksKey = '';
    stopAll(); fmtInfo(); redraw();
    toast('已撤销');
  });
  resetBtn.addEventListener('click', () => {
    if (!original) return;
    pushUndo();
    stopAll();
    buffer = original;
    sel = null;
    peaksKey = '';
    fmtInfo(); redraw();
    toast('已重置为原始音频');
  });

  /* ---------- 变速不变调（Hann 窗 OLA 时域拉伸） ---------- */
  function timeStretch(b, tempo) {
    const sr = b.sampleRate, ch = b.numberOfChannels;
    const hop = 1024, G = 2048;
    const win = new Float32Array(G);
    for (let i = 0; i < G; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / G);
    const Ha = Math.max(1, Math.floor(hop / tempo));
    const outLen = Math.max(G, Math.floor(b.length / tempo) + G);
    const out = ctx.createBuffer(ch, outLen, sr);
    const norm = 1.5; // Hann 窗 50% 重叠的能量补偿
    for (let c = 0; c < ch; c++) {
      const inD = b.getChannelData(c), outD = out.getChannelData(c);
      let read = 0, write = 0;
      while (write + G < outLen && read + G < inD.length) {
        for (let i = 0; i < G; i++) outD[write + i] += inD[read + i] * win[i];
        read += Ha; write += hop;
      }
      for (let i = 0; i < outLen; i++) outD[i] /= norm;
    }
    return out;
  }

  tempoIn.addEventListener('input', () => { tVal.textContent = (+tempoIn.value / 100).toFixed(2); });

  /* ---------- 导出 ---------- */
  function encodeWav(b) {
    const ch = Math.min(2, b.numberOfChannels), sr = b.sampleRate, len = b.length;
    const bytes = 44 + len * ch * 2;
    const ab = new ArrayBuffer(bytes), view = new DataView(ab);
    const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, bytes - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, ch, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * ch * 2, true); view.setUint16(32, ch * 2, true);
    view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, len * ch * 2, true);
    let off = 44;
    const chans = [];
    for (let c = 0; c < ch; c++) chans.push(b.getChannelData(c));
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        let v = Math.max(-1, Math.min(1, chans[c][i]));
        view.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  function floatTo16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      const v = Math.max(-1, Math.min(1, f32[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
    }
    return out;
  }

  function encodeMp3(b, kbps) {
    const ch = Math.min(2, b.numberOfChannels);
    const enc = new lamejs.Mp3Encoder(ch, b.sampleRate, kbps);
    const left = floatTo16(b.getChannelData(0));
    const right = ch > 1 ? floatTo16(b.getChannelData(1)) : null;
    const block = 1152, out = [];
    for (let i = 0; i < left.length; i += block) {
      const l = left.subarray(i, i + block);
      const r = right ? right.subarray(i, i + block) : undefined;
      const buf = ch > 1 ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
      if (buf.length) out.push(new Uint8Array(buf));
    }
    const end = enc.flush();
    if (end.length) out.push(new Uint8Array(end));
    return new Blob(out, { type: 'audio/mpeg' });
  }

  exportBtn.addEventListener('click', async () => {
    if (!buffer) return;
    exportBtn.disabled = true;
    exportBtn.textContent = '导出中…';
    try {
      await new Promise(r => setTimeout(r, 30)); // 让按钮文案先渲染
      let out = buffer;
      const tempo = +tempoIn.value / 100;
      if (Math.abs(tempo - 1) > 0.01) {
        out = timeStretch(out, tempo);
      }
      const fmt = fmtSel.value;
      const blob = fmt === 'mp3' ? encodeMp3(out, 192) : encodeWav(out);
      const base = fileName.replace(/\.[^.]+$/, '');
      const name = `${base}_edit${Math.abs(tempo - 1) > 0.01 ? '_x' + tempo.toFixed(2) : ''}.${fmt}`;
      downloadBlob(blob, name);
      toast(`已导出 ${name}（${formatBytes(blob.size)}）`, 'success');
    } catch (e) {
      console.error(e);
      toast('导出失败：' + e.message, 'error');
    }
    exportBtn.disabled = !canPlay();
    exportBtn.textContent = '导出音频';
  });

  /* ---------- 载入 / 拼接 ---------- */
  async function decodeFile(file) {
    const ab = await file.arrayBuffer();
    return await ctx.decodeAudioData(ab);
  }

  async function addFiles(fileList) {
    const files = [...fileList].filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name));
    if (!files.length) { toast('请选择音频文件', 'error'); return; }
    stopAll();
    input.disabled = true;
    try {
      for (const f of files) {
        const decoded = await decodeFile(f);
        if (!buffer) {
          buffer = decoded;
          original = decoded;
          fileName = f.name;
        } else {
          pushUndo();
          buffer = concatBuffers(buffer, decoded);
          fileName += '+' + f.name;
        }
      }
      sel = null;
      peaksKey = '';
      info.hidden = false;
      fmtInfo();
      redraw();
      toast('已载入', 'success');
    } catch (e) {
      console.error(e);
      toast('解码失败：' + e.message, 'error');
    }
    input.disabled = false;
    updateButtons();
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    addFiles(e.dataTransfer.files);
  });

  redraw(); // 初始化即设定画布尺寸（空状态也保持正确比例）
  updateButtons();
}
