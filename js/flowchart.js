/* ============ 流程图 / 导图（Cytoscape + dagre 自动布局） ============ */
Toolbox.register({
  id: 'flowchart',
  name: '流程图 / 导图',
  icon: '🧠',
  desc: '流程图与思维导图编辑器：添加节点、连线模式下点击两个节点建立箭头、dagre 自动布局，导出 PNG / JSON。',
  init: initFlowchartTool
});

function initFlowchartTool() {
  try { if (window.cytoscapeDagre) cytoscape.use(cytoscapeDagre); } catch (e) { /* 重复注册忽略 */ }

  const cy = cytoscape({
    container: $('#fc-canvas'),
    elements: [],
    wheelSensitivity: 0.2,
    boxSelectionEnabled: true,
    style: [
      { selector: 'node', style: {
        label: 'data(label)', 'text-valign': 'center', 'text-halign': 'center',
        shape: 'round-rectangle', width: 'label', height: 40, 'min-width': 76,
        padding: '14px',
        'background-color': '#4f6ef7', color: '#ffffff', 'font-size': 13, 'border-width': 0
      } },
      { selector: 'node.ellipse', style: { shape: 'ellipse', 'background-color': '#2fb672', 'min-width': 96, height: 56 } },
      { selector: 'node.diamond', style: { shape: 'diamond', 'background-color': '#e5a03c', 'min-width': 112, height: 64, 'font-size': 12, padding: '18px' } },
      { selector: 'node.parallelogram', style: { shape: 'rhomboid', 'background-color': '#8b5cf6', 'min-width': 92, height: 44 } },
      { selector: 'node.hexagon', style: { shape: 'hexagon', 'background-color': '#0ea5a4', 'min-width': 92, height: 46 } },
      { selector: 'node.octagon', style: { shape: 'round-octagon', 'background-color': '#64748b', 'min-width': 92, height: 44 } },
      { selector: 'node.star', style: { shape: 'star', 'background-color': '#f59e0b', width: 64, height: 64, 'font-size': 10 } },
      { selector: 'edge', style: {
        width: 2, 'line-color': '#8b94ab', 'target-arrow-color': '#8b94ab',
        'target-arrow-shape': 'triangle', 'curve-style': 'bezier',
        label: 'data(label)', 'font-size': 11, color: '#8b94ab',
        'text-background-color': '#ffffff', 'text-background-opacity': 0.92, 'text-background-padding': 2
      } },
      { selector: 'node.connect-source', style: { 'border-width': 3, 'border-color': '#e5484d' } },
      { selector: ':selected', style: { 'overlay-color': '#4f6ef7', 'overlay-opacity': 0.12 } }
    ]
  });
  window.__flowchartCy = cy; // 便于控制台调试

  let nodeCount = 0, connectMode = false, pending = null;
  const textInput = $('#fc-node-text'), statsEl = $('#fc-stats'), textColorIn = $('#fc-text-color');

  function rgbToHex(c) {
    const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return '#ffffff';
    return '#' + [1, 2, 3].map(i => (+m[i]).toString(16).padStart(2, '0')).join('');
  }

  const updateStats = () => { statsEl.textContent = `${cy.nodes().length} 节点 · ${cy.edges().length} 连线`; };
  cy.on('add remove', updateStats);

  function cancelPending() {
    if (pending) { pending.removeClass('connect-source'); pending = null; }
  }

  /* 工具切换 */
  $$('#fc-tools .tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#fc-tools .tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b === btn));
      connectMode = btn.dataset.tool === 'connect';
      cancelPending();
      toast(connectMode ? '连线模式：依次点击起点和终点节点' : '选择模式：拖动节点 / 框选');
    });
  });

  /* 添加节点（出现在视口中心附近） */
  $$('#fc-tools .tool-btn[data-add]').forEach(btn => {
    btn.addEventListener('click', () => {
      nodeCount++;
      const center = { x: cy.width() / 2, y: cy.height() / 2 };
      const pan = cy.pan(), zoom = cy.zoom();
      const n = cy.add({
        group: 'nodes',
        data: { label: '节点 ' + nodeCount },
        position: {
          x: (center.x - pan.x) / zoom + (Math.random() * 100 - 50),
          y: (center.y - pan.y) / zoom + (Math.random() * 70 - 35)
        },
        classes: btn.dataset.add === 'round' ? '' : btn.dataset.add
      });
      cy.elements().unselect();
      n.select();
    });
  });

  /* 连线：连线模式下依次点击两个节点 */
  cy.on('tap', 'node', e => {
    if (!connectMode) return;
    const node = e.target;
    if (!pending) { pending = node; node.addClass('connect-source'); return; }
    if (pending.id() === node.id()) { cancelPending(); return; }
    cy.add({ group: 'edges', data: { source: pending.id(), target: node.id() } });
    cancelPending();
  });
  cy.on('tap', e => { if (connectMode && e.target === cy) cancelPending(); });

  /* 双击节点 → 聚焦文字输入框 */
  let lastTap = { id: null, t: 0 };
  cy.on('tap', 'node', e => {
    const now = Date.now();
    if (lastTap.id === e.target.id() && now - lastTap.t < 400) {
      textInput.focus();
      textInput.select();
    }
    lastTap = { id: e.target.id(), t: now };
  });

  /* 选中节点 → 文字框同步；输入 → 实时改标签与文字颜色 */
  cy.on('select', 'node', () => {
    const n = cy.$('node:selected');
    if (n.nonempty()) {
      textInput.value = n.data('label') || '';
      textColorIn.value = rgbToHex(n.style('color'));
    }
  });
  textInput.addEventListener('input', () => {
    const n = cy.$('node:selected');
    if (n.nonempty()) n.data('label', textInput.value);
  });
  textInput.addEventListener('keydown', e => { if (e.key === 'Enter') textInput.blur(); });
  textColorIn.addEventListener('input', () => {
    const n = cy.$('node:selected');
    if (n.nonempty()) n.style('color', textColorIn.value);
  });

  /* 全屏（整卡进入，保留工具栏；Esc 或按钮退出） */
  const fsBtn = $('#fc-fullscreen');
  fsBtn.addEventListener('click', () => {
    const card = fsBtn.closest('.card');
    if (document.fullscreenElement) document.exitFullscreen();
    else card.requestFullscreen().catch(() => toast('当前环境不支持全屏', 'error'));
  });
  document.addEventListener('fullscreenchange', () => {
    const active = document.fullscreenElement === fsBtn.closest('.card');
    fsBtn.textContent = active ? '✕ 退出全屏' : '⛶ 全屏';
    setTimeout(() => cy.resize(), 80); // 尺寸变化后让画布重新适配容器
  });

  /* 适配视野：只缩小不放大小图，避免布局后节点被放得巨大 */
  function fitFlowchart() {
    cy.fit(undefined, 40);
    if (cy.zoom() > 1) { cy.zoom(1); cy.center(); }
  }

  /* 自动布局 */
  $$('#fc-tools .tool-btn[data-layout]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!cy.nodes().length) { toast('画布为空', 'error'); return; }
      cy.one('layoutstop', fitFlowchart);
      cy.layout({
        name: 'dagre', rankDir: btn.dataset.layout,
        rankSep: 70, nodeSep: 40, animate: true, animationDuration: 350,
        fit: true, padding: 40
      }).run();
    });
  });

  /* 示例 */
  $('#fc-example').addEventListener('click', () => {
    cy.elements().remove();
    nodeCount = 0;
    const add = (id, label, cls, x, y) => cy.add({ group: 'nodes', data: { id, label }, position: { x, y }, classes: cls });
    add('a', '开始', 'ellipse', 0, 150);
    add('b', '读取配置', 'parallelogram', 190, 150);
    add('c', '解析成功？', 'diamond', 400, 150);
    add('d', '提示错误', 'round', 620, 280);
    add('e', '加载完成', 'ellipse', 620, 60);
    add('f', '清理临时文件', 'hexagon', 830, 60);
    const edge = (s, t, label) => cy.add({ group: 'edges', data: { source: s, target: t, label: label || '' } });
    edge('a', 'b');
    edge('b', 'c');
    edge('c', 'd', '否');
    edge('c', 'e', '是');
    edge('d', 'b', '重试');
    edge('e', 'f');
    fitFlowchart();
  });

  /* 删除 */
  const deleteSelected = () => { const sel = cy.$(':selected'); if (sel.nonempty()) cy.remove(sel); };
  $('#fc-delete').addEventListener('click', deleteSelected);
  cy.on('cxttap', e => { if (e.target !== cy) cy.remove(e.target); }); // 右键删除单个元素

  document.addEventListener('keydown', e => {
    if (currentRoute() !== 'flowchart') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
    if (e.key === 'Escape') cancelPending();
  });

  /* 导出 */
  $('#fc-png').addEventListener('click', () => {
    if (!cy.nodes().length) { toast('画布为空', 'error'); return; }
    downloadBlob(dataURLtoBlob(cy.png({ full: true, bg: '#ffffff' })), 'flowchart.png');
    toast('已下载 flowchart.png', 'success');
  });
  $('#fc-save').addEventListener('click', () => {
    downloadBlob(new Blob([JSON.stringify({ elements: cy.elements().jsons() }, null, 2)], { type: 'application/json' }), 'flowchart.json');
    toast('已下载 flowchart.json', 'success');
  });
  $('#fc-load').addEventListener('click', () => $('#fc-file').click());
  $('#fc-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      cy.elements().remove();
      cy.add(j.elements || j);
      fitFlowchart();
      toast('已载入 ' + f.name, 'success');
    } catch (err) { toast('载入失败：' + err.message, 'error'); }
  });
  $('#fc-clear').addEventListener('click', () => { cy.elements().remove(); cancelPending(); });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => cy.resize(), 200);
  });

  updateStats();
}
