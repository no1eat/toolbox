/* ============ 画板 / 标注（Fabric.js 本地画板） ============ */
Toolbox.register({
  id: 'board',
  name: '画板 / 标注',
  icon: '🎨',
  desc: '基于 Fabric.js 的本地画板：画笔、直线、矩形、椭圆、文字与图片标注，支持撤销、导出 PNG / JSON。',
  init: initBoardTool
});

function initBoardTool() {
  const canvas = new fabric.Canvas('board-canvas', {
    backgroundColor: '#ffffff',
    preserveObjectStacking: true
  });
  canvas.setWidth(900);
  canvas.setHeight(520);
  window.__boardCanvas = canvas; // 便于控制台调试

  let tool = 'select', color = '#e5484d', width = 3;
  let shape = null, arrowHead = null, sx = 0, sy = 0;
  const colorIn = $('#bd-color'), widthIn = $('#bd-width'), widthVal = $('#bd-w-val');

  /* 五角星顶点：以 (0,0) 为中心、半径 r 的星形轮廓 */
  function starPoints(r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
    }
    return pts;
  }

  colorIn.addEventListener('input', () => {
    color = colorIn.value;
    applyStyleToActive();
  });
  widthIn.addEventListener('input', () => {
    width = +widthIn.value;
    widthVal.textContent = width;
    canvas.freeDrawingBrush.width = width;
    applyStyleToActive();
  });

  function applyStyleToActive() {
    const ao = canvas.getActiveObject();
    if (!ao) return;
    if (ao.type === 'i-text') ao.set({ fill: color });
    else ao.set({ stroke: color, strokeWidth: width });
    canvas.requestRenderAll();
  }

  /* 工具切换 */
  function setTool(t) {
    tool = t;
    $$('#bd-tools .tool-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    canvas.isDrawingMode = t === 'brush';
    if (t === 'brush') { canvas.freeDrawingBrush.color = color; canvas.freeDrawingBrush.width = width; }
    canvas.selection = t === 'select';
    canvas.forEachObject(o => { o.selectable = t === 'select'; o.evented = t === 'select'; });
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }
  $$('#bd-tools .tool-btn').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));

  /* 形状 / 文字绘制 */
  canvas.on('mouse:down', opt => {
    if (tool === 'select') {
      if (canvas.getActiveObject()) pushState(); // 即将拖动 / 缩放
      return;
    }
    if (tool === 'brush') { pushState(); return; } // 即将开始一笔
    const p = canvas.getPointer(opt.e);
    sx = p.x; sy = p.y;

    if (tool === 'text') {
      pushState();
      setTool('select');
      const t = new fabric.IText('双击编辑文字', {
        left: sx, top: sy, fill: color, fontSize: 20,
        fontFamily: 'system-ui, "Microsoft YaHei", sans-serif'
      });
      canvas.add(t);
      canvas.setActiveObject(t);
      t.enterEditing();
      return;
    }
    pushState();
    if (tool === 'rect') {
      shape = new fabric.Rect({ left: sx, top: sy, width: 0, height: 0, fill: 'transparent', stroke: color, strokeWidth: width, selectable: false });
    } else if (tool === 'ellipse') {
      shape = new fabric.Ellipse({ left: sx, top: sy, rx: 0, ry: 0, fill: 'transparent', stroke: color, strokeWidth: width, selectable: false });
    } else if (tool === 'triangle') {
      shape = new fabric.Triangle({ left: sx, top: sy, width: 0, height: 0, fill: 'transparent', stroke: color, strokeWidth: width, selectable: false });
    } else if (tool === 'star') {
      shape = new fabric.Polygon(starPoints(50), {
        left: sx, top: sy, scaleX: 0.02, scaleY: 0.02,
        fill: 'transparent', stroke: color, strokeWidth: width,
        selectable: false, originX: 'left', originY: 'top'
      });
    } else if (tool === 'arrow') {
      shape = new fabric.Line([sx, sy, sx, sy], { stroke: color, strokeWidth: width, selectable: false });
      arrowHead = new fabric.Triangle({
        width: 14 + width * 1.5, height: 14 + width * 1.5, fill: color,
        left: sx, top: sy, angle: 90, originX: 'center', originY: 'center', selectable: false
      });
      canvas.add(arrowHead);
    } else if (tool === 'line') {
      shape = new fabric.Line([sx, sy, sx, sy], { stroke: color, strokeWidth: width, selectable: false });
    }
    if (shape) canvas.add(shape);
  });

  canvas.on('mouse:move', opt => {
    if (!shape) return;
    const p = canvas.getPointer(opt.e);
    if (tool === 'rect') {
      shape.set({ left: Math.min(sx, p.x), top: Math.min(sy, p.y), width: Math.abs(p.x - sx), height: Math.abs(p.y - sy) });
    } else if (tool === 'ellipse') {
      shape.set({ left: Math.min(sx, p.x), top: Math.min(sy, p.y), rx: Math.abs(p.x - sx) / 2, ry: Math.abs(p.y - sy) / 2 });
    } else if (tool === 'triangle') {
      shape.set({ left: Math.min(sx, p.x), top: Math.min(sy, p.y), width: Math.abs(p.x - sx), height: Math.abs(p.y - sy) });
    } else if (tool === 'star') {
      shape.set({
        scaleX: Math.max(0.02, Math.abs(p.x - sx) / 100),
        scaleY: Math.max(0.02, Math.abs(p.y - sy) / 100),
        left: Math.min(sx, p.x), top: Math.min(sy, p.y)
      });
    } else if (tool === 'arrow') {
      shape.set({ x2: p.x, y2: p.y });
      const ang = Math.atan2(p.y - sy, p.x - sx) * 180 / Math.PI;
      arrowHead.set({ left: p.x, top: p.y, angle: ang + 90 });
    } else if (tool === 'line') {
      shape.set({ x2: p.x, y2: p.y });
    }
    canvas.requestRenderAll();
  });

  canvas.on('mouse:up', () => {
    if (tool === 'arrow' && shape && arrowHead) {
      canvas.remove(arrowHead);
      const grp = new fabric.Group([shape, arrowHead], { selectable: true });
      canvas.add(grp);
      canvas.setActiveObject(grp);
      shape = null; arrowHead = null;
      return;
    }
    if (!shape) return;
    shape.set({ selectable: true });
    shape.setCoords();
    canvas.setActiveObject(shape);
    shape = null;
  });

  /* 撤销：在每个改动动作"开始前"记录状态，撤销即回退到上一份状态 */
  const undoStack = [];
  function pushState() {
    undoStack.push(JSON.stringify(canvas.toJSON()));
    if (undoStack.length > 30) undoStack.shift();
  }
  pushState(); // 初始空白状态

  function undo() {
    if (!undoStack.length) { toast('没有可撤销的操作'); return; }
    canvas.loadFromJSON(undoStack.pop(), () => canvas.renderAll());
    toast('已撤销');
  }
  $('#bd-undo').addEventListener('click', undo);

  function deleteSelected() {
    const objs = canvas.getActiveObjects();
    if (!objs.length) return;
    pushState();
    objs.forEach(o => canvas.remove(o));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }

  document.addEventListener('keydown', e => {
    if (currentRoute() !== 'board') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const ao = canvas.getActiveObject();
    if (ao && ao.isEditing) return; // 正在编辑文字时不拦截按键
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  });

  /* 插入图片 */
  $('#bd-image').addEventListener('click', () => $('#bd-file').click());
  $('#bd-file').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      fabric.Image.fromURL(ev.target.result, img => {
        pushState();
        const scale = Math.min(1, (canvas.getWidth() - 40) / img.width, (canvas.getHeight() - 40) / img.height);
        img.set({ left: 30, top: 30 }).scale(scale);
        canvas.add(img);
        canvas.setActiveObject(img);
      });
    };
    reader.readAsDataURL(f);
  });

  /* 导出 */
  $('#bd-png').addEventListener('click', () => {
    downloadBlob(dataURLtoBlob(canvas.toDataURL({ format: 'png', multiplier: 2 })), 'board.png');
    toast('已下载 board.png', 'success');
  });
  $('#bd-save').addEventListener('click', () => {
    downloadBlob(new Blob([JSON.stringify(canvas.toJSON())], { type: 'application/json' }), 'board.json');
    toast('已下载 board.json', 'success');
  });
  $('#bd-load').addEventListener('click', () => $('#bd-file-json').click());
  $('#bd-file-json').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      pushState();
      canvas.loadFromJSON(JSON.parse(await f.text()), () => { canvas.renderAll(); toast('已载入 ' + f.name, 'success'); });
    } catch (err) { toast('载入失败：' + err.message, 'error'); }
  });
  $('#bd-clear').addEventListener('click', () => {
    pushState();
    canvas.getObjects().slice().forEach(o => canvas.remove(o));
    canvas.backgroundColor = '#ffffff';
    canvas.requestRenderAll();
    toast('画布已清空');
  });

  /* 全屏（整卡进入，保留工具栏；Esc 或按钮退出） */
  const fsBtn = $('#bd-fullscreen');
  fsBtn.addEventListener('click', () => {
    const card = fsBtn.closest('.card');
    if (document.fullscreenElement) document.exitFullscreen();
    else card.requestFullscreen().catch(() => toast('当前环境不支持全屏', 'error'));
  });
  document.addEventListener('fullscreenchange', () => {
    fsBtn.textContent = document.fullscreenElement === fsBtn.closest('.card') ? '✕ 退出全屏' : '⛶ 全屏';
    canvas.requestRenderAll();
  });

  /* 默认画笔参数 */
  canvas.freeDrawingBrush.color = color;
  canvas.freeDrawingBrush.width = width;
}
