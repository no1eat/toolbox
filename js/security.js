/* ============ 密码生成器 + 哈希计算器 ============ */
Toolbox.register({
  id: 'security',
  name: '密码 / 哈希',
  icon: '🔐',
  desc: '基于 crypto.getRandomValues 的安全密码生成器（强度评估、防模偏差取样），以及 MD5 / SHA 系列文本与文件哈希计算。',
  init: initSecurityTool
});

function initSecurityTool() {
  /* ================= 密码生成器 ================= */
  const out = $('#pw-out'), lenRange = $('#pw-len'), lenVal = $('#pw-len-val');
  const fill = $('#pw-strength-fill'), strengthText = $('#pw-strength-text');

  const SETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    symbol: '!@#$%^&*()-_=+[]{};:,.?'
  };
  const AMBIGUOUS = /[lI1O0]/g;

  // [0, max) 均匀随机整数：拒绝采样消除取模偏差
  function randInt(max) {
    const limit = Math.floor(4294967296 / max) * max;
    const buf = new Uint32Array(1);
    let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return v % max;
  }

  function generate() {
    const len = +lenRange.value;
    const active = ['upper', 'lower', 'digit', 'symbol'].filter(k => $('#pw-' + k).checked);
    if (!active.length) { toast('请至少选择一种字符类型', 'error'); return; }

    const pools = active.map(k => $('#pw-ambiguous').checked ? SETS[k].replace(AMBIGUOUS, '') : SETS[k]);
    const all = pools.join('');

    // 每类至少一个，其余从总池取，再 Fisher-Yates 洗牌
    const chars = pools.map(p => p[randInt(p.length)]);
    for (let i = chars.length; i < len; i++) chars.push(all[randInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const pw = chars.slice(0, len).join('');

    out.textContent = pw;
    const entropy = Math.round(len * Math.log2(all.length));
    const level = entropy < 45 ? 0 : entropy < 65 ? 1 : entropy < 90 ? 2 : 3;
    const conf = [
      { w: '25%', c: '#e5484d', t: `弱（约 ${entropy} bit 熵）` },
      { w: '50%', c: '#e5a03c', t: `中（约 ${entropy} bit 熵）` },
      { w: '75%', c: '#2fb672', t: `强（约 ${entropy} bit 熵）` },
      { w: '100%', c: '#1aa06d', t: `极强（约 ${entropy} bit 熵）` }
    ][level];
    fill.style.width = conf.w;
    fill.style.background = conf.c;
    strengthText.textContent = conf.t;
  }

  lenRange.addEventListener('input', () => { lenVal.textContent = lenRange.value; generate(); });
  $$('#view-security .card:first-of-type input[type="checkbox"]').forEach(cb => cb.addEventListener('change', generate));
  $('#pw-run').addEventListener('click', generate);
  $('#pw-copy').addEventListener('click', () => copyText(out.textContent));
  out.addEventListener('click', () => copyText(out.textContent));
  generate();

  /* ================= 哈希计算器 ================= */
  const textEl = $('#hash-text'), fileBtn = $('#hash-file-btn');
  const sourceEl = $('#hash-source'), outEl = $('#hash-out'), copyAll = $('#hash-copy-all');
  const ALGOS = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
  let lastHashes = []; // { algo, hex }
  let timer = null;
  let lastSource = ''; // 去重：内容未变时不重复计算

  function bufToHex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function compute(sourceKey, getBytes) {
    lastSource = sourceKey;
    copyAll.disabled = true;
    outEl.innerHTML = '<tr><td class="muted">计算中…</td></tr>';
    const bytes = await getBytes();
    const results = await Promise.all(ALGOS.map(async algo => {
      if (algo === 'MD5') {
        return { algo, hex: window.md5.hexBytes(bytes) };
      }
      if (!(crypto && crypto.subtle)) {
        return { algo, hex: '（需要 HTTPS / localhost / file:// 安全上下文）' };
      }
      const digest = await crypto.subtle.digest(algo, bytes);
      return { algo, hex: bufToHex(digest) };
    }));
    if (lastSource !== sourceKey) return; // 期间用户又输入了新内容
    lastHashes = results;
    outEl.innerHTML = '';
    results.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="algo">${r.algo}</td><td class="val">${r.hex}</td>`;
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn'; btn.textContent = '复制';
      btn.addEventListener('click', () => copyText(r.hex));
      td.appendChild(btn);
      tr.appendChild(td);
      outEl.appendChild(tr);
    });
    copyAll.disabled = true;
    const allOk = results.every(r => !r.hex.startsWith('（'));
    copyAll.disabled = !allOk;
  }

  textEl.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const text = textEl.value;
      fileBtn.textContent = '选择文件';
      if (!text) {
        lastSource = ''; lastHashes = [];
        outEl.innerHTML = '<tr><td class="muted">等待输入…</td></tr>';
        copyAll.disabled = true;
        sourceEl.textContent = '';
        return;
      }
      sourceEl.textContent = `来源：文本（${new TextEncoder().encode(text).length} 字节）`;
      compute('text:' + text, async () => new TextEncoder().encode(text));
    }, 300);
  });

  fileBtn.addEventListener('click', () => $('#hash-file').click());
  $('#hash-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    textEl.value = '';
    sourceEl.textContent = `来源：文件 ${file.name}（${formatBytes(file.size)}）`;
    compute('file:' + file.name + ':' + file.size + ':' + file.lastModified, () => file.arrayBuffer());
  });

  copyAll.addEventListener('click', () => {
    if (!lastHashes.length) return;
    copyText(lastHashes.map(r => `${r.algo}: ${r.hex}`).join('\n'));
  });
}
