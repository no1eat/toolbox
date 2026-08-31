/* ============ JSON / CSV / Excel 互转（SheetJS） ============ */
Toolbox.register({
  id: 'convert',
  name: '数据格式转换',
  icon: '🔁',
  desc: 'JSON / CSV / Excel（xlsx、xls）互相转换：表格文件转 JSON/CSV，或把 JSON、CSV 生成 Excel。',
  init: initConvertTool
});

function initConvertTool() {
  /* ---------- 面板切换 ---------- */
  $$('#cv-tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('#cv-tabs .tab').forEach(t => t.classList.toggle('active', t === tab));
      $('#cv-pane-tojson').hidden = tab.dataset.mode !== 'tojson';
      $('#cv-pane-toexcel').hidden = tab.dataset.mode !== 'toexcel';
    });
  });

  /* ---------- Excel/CSV → JSON ---------- */
  const cvDrop = $('#cv-drop'), cvFile = $('#cv-file');
  const sheetWrap = $('#cv-sheet-wrap'), sheetSel = $('#cv-sheet'), outSel = $('#cv-out-format');
  const preview = $('#cv-tojson-preview'), runBtn = $('#cv-tojson-run'), copyBtn = $('#cv-tojson-copy');
  let workbook = null, fileName = '';

  function bindDrop(drop, input, handler) {
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { handler(input.files[0]); input.value = ''; });
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('dragover'); handler(e.dataTransfer.files[0]); });
  }

  bindDrop(cvDrop, cvFile, async file => {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { toast('请选择 .xlsx / .xls / .csv 文件', 'error'); return; }
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      workbook = XLSX.read(data, { type: 'array' });
      fileName = file.name.replace(/\.[^.]+$/, '');
      sheetSel.innerHTML = '';
      workbook.SheetNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = name;
        sheetSel.appendChild(opt);
      });
      sheetWrap.hidden = false;
      showPreview();
    } catch (e) {
      console.error(e);
      workbook = null; sheetWrap.hidden = true;
      preview.hidden = true; runBtn.disabled = copyBtn.disabled = true;
      toast('解析失败：' + e.message, 'error');
    }
  });

  sheetSel.addEventListener('change', showPreview);
  outSel.addEventListener('change', showPreview);

  function currentOutput() {
    if (!workbook) return null;
    const ws = workbook.Sheets[sheetSel.value];
    if (!ws) return null;
    if (outSel.value === 'json') {
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      return { text: JSON.stringify(rows, null, 2), ext: 'json', mime: 'application/json' };
    }
    // CSV 输出带 BOM，保证 Excel 直接打开中文不乱码
    const csv = '\ufeff' + XLSX.utils.sheet_to_csv(ws);
    return { text: csv, ext: 'csv', mime: 'text/csv;charset=utf-8' };
  }

  function showPreview() {
    const out = currentOutput();
    if (!out) return;
    preview.hidden = false;
    const text = out.text.length > 4000 ? out.text.slice(0, 4000) + '\n…（仅预览前 4000 字符）' : out.text;
    preview.textContent = text;
    runBtn.disabled = copyBtn.disabled = false;
  }

  runBtn.addEventListener('click', () => {
    const out = currentOutput();
    if (!out) return;
    downloadBlob(new Blob([out.text], { type: out.mime }), `${fileName || 'data'}.${out.ext}`);
    toast('已下载', 'success');
  });
  copyBtn.addEventListener('click', () => {
    const out = currentOutput();
    if (out) copyText(out.text);
  });

  /* ---------- JSON/CSV → Excel ---------- */
  const input = $('#cv-input'), file2Btn = $('#cv-file2-btn');
  const outSel2 = $('#cv-out-format2'), preview2 = $('#cv-toexcel-preview'), runBtn2 = $('#cv-toexcel-run');
  let parsed = null; // { rows, kind, sourceName }

  file2Btn.addEventListener('click', () => $('#cv-file2').click());
  $('#cv-file2').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    input.value = await file.text();
    parseInput(file.name);
  });

  input.addEventListener('input', () => parseInput());

  function parseInput(sourceName = '') {
    const text = input.value.trim();
    parsed = null;
    preview2.hidden = true;
    if (!text) return;
    try {
      if (text.startsWith('[') || text.startsWith('{')) {
        let data = JSON.parse(text);
        if (!Array.isArray(data)) data = [data];
        if (!data.length) throw new Error('JSON 数组为空');
        parsed = { rows: data, kind: 'json', sourceName };
      } else {
        const wb = XLSX.read(text, { type: 'string' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        if (!rows.length) throw new Error('没有解析到任何行');
        parsed = { rows, kind: 'csv', sourceName };
      }
      const head = JSON.stringify(parsed.rows.slice(0, 5), null, 2);
      preview2.hidden = false;
      preview2.textContent = `✓ 解析成功：${parsed.rows.length} 行（${parsed.kind === 'json' ? 'JSON 对象数组' : 'CSV 文本'}）\n` +
        (head.length > 1500 ? head.slice(0, 1500) + '…' : head);
    } catch (e) {
      preview2.hidden = false;
      preview2.textContent = '✕ 解析失败：' + e.message + '\n支持：JSON 对象数组，或以第一行为表头的 CSV 文本。';
    }
  }

  function rowsToSheet(rows) {
    if (rows.length && typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
      // 对象数组：合并所有出现过的键，保持首次出现顺序；嵌套结构序列化为字符串
      const keys = [];
      rows.forEach(r => Object.keys(r ?? {}).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
      const flat = rows.map(r => {
        const o = {};
        keys.forEach(k => {
          const v = r?.[k];
          o[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
        });
        return o;
      });
      return XLSX.utils.json_to_sheet(flat, { defval: '' });
    }
    // 二维数组（来自 CSV 或 JSON 数组的数组）
    const aoa = rows.map(row => Array.isArray(row) ? row : [row]);
    return XLSX.utils.aoa_to_sheet(aoa);
  }

  runBtn2.addEventListener('click', () => {
    if (!parsed) { parseInput(); }
    if (!parsed) { toast('请先输入有效的 JSON 或 CSV 数据', 'error'); return; }
    try {
      const ws = rowsToSheet(parsed.rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const name = (parsed.sourceName || 'data').replace(/\.[^.]+$/, '');
      if (outSel2.value === 'xlsx') {
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name + '.xlsx');
      } else {
        const csv = '\ufeff' + XLSX.utils.sheet_to_csv(ws);
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), name + '.csv');
      }
      toast('已下载', 'success');
    } catch (e) {
      console.error(e);
      toast('转换失败：' + e.message, 'error');
    }
  });
}
