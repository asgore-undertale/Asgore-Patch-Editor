// ── Splitter Resizing Logic ────────────────────
const splitTreeHex = document.getElementById('split-tree-hex');
const splitHexExcel = document.getElementById('split-hex-excel');
const splitExcelCode = document.getElementById('split-excel-code');
const splitCodeGroups = document.getElementById('split-code-groups');
const splitCodeOut = document.getElementById('split-code-out');

const codeEditorWrap = document.querySelector('.code-editor-wrap');

// ── Panel Toggles ─────────────────────────────
const btnToggleTree = document.getElementById('btn-toggle-tree');
const btnToggleExcel = document.getElementById('btn-toggle-excel');
const btnToggleGroups = document.getElementById('btn-toggle-groups');

function setupToggle(btn, panel, splitter, expandedIcon, collapsedIcon) {
  if (!btn || !panel) return;
  btn.addEventListener('click', () => {
    const isCollapsed = panel.classList.toggle('collapsed');
    btn.textContent = isCollapsed ? collapsedIcon : expandedIcon;
    if (splitter) {
      splitter.style.display = isCollapsed ? 'none' : 'block';
    }
    setTimeout(() => refreshRows(), 320);
  });
}

setupToggle(btnToggleTree, fileTreePanel, splitTreeHex, '◀', '▶');
setupToggle(btnToggleExcel, excelViewerPanel, splitHexExcel, '◀', '▶');
setupToggle(btnToggleGroups, groupsPanel, splitCodeGroups, '▶', '◀');

function initSplitter(splitter, type, onDrag, panel) {
  if (!splitter) return;
  let isDragging = false;

  splitter.addEventListener('mousedown', (e) => {
    if (panel && panel.classList.contains('collapsed')) return;
    isDragging = true;
    splitter.classList.add('dragging');
    document.body.style.cursor = type === 'v' ? 'col-resize' : 'row-resize';
    e.preventDefault(); // prevent text selection
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    onDrag(e);
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      if (typeof refreshRows === 'function') refreshRows(); // Recalculate virtual rows exactly once on drop
    }
  });
}

// 0. File Tree | Hex (adjust File Tree Panel width)
let treeDragStartLeft = 0;
splitTreeHex.addEventListener('mousedown', () => {
  treeDragStartLeft = fileTreePanel.getBoundingClientRect().left;
});
initSplitter(splitTreeHex, 'v', (e) => {
  const newWidth = e.clientX - treeDragStartLeft;
  if (newWidth > 120 && newWidth < 500) {
    fileTreePanel.style.width = newWidth + 'px';
  }
}, fileTreePanel);

// 1. Hex | Excel Viewer (adjust Excel Viewer width from the left)
let excelDragStartRight = 0;
splitHexExcel.addEventListener('mousedown', () => {
  const rect = excelViewerPanel.getBoundingClientRect();
  excelDragStartRight = rect.right;
});
initSplitter(splitHexExcel, 'v', (e) => {
  const newWidth = excelDragStartRight - e.clientX;
  if (newWidth > 20 && newWidth < 1200) {
    excelViewerPanel.style.width = newWidth + 'px';
  }
}, excelViewerPanel);

// 1.5 Excel Viewer | Code Runner (adjust Code Runner width from the left)
let codeDragStartRight = 0;
splitExcelCode.addEventListener('mousedown', () => {
  const isCollapsed = codeRunnerPanel.classList.contains('collapsed');
  if (!isCollapsed) {
    codeDragStartRight = codeRunnerPanel.getBoundingClientRect().right;
  }
});
initSplitter(splitExcelCode, 'v', (e) => {
  const isCollapsed = codeRunnerPanel.classList.contains('collapsed');
  if (!isCollapsed) {
    const newWidth = codeDragStartRight - e.clientX;
    if (newWidth > 150 && newWidth < 800) {
      codeRunnerPanel.style.width = newWidth + 'px';
    }
  }
}, codeRunnerPanel);

// 2. Code Runner | Groups Panel (adjust Groups Panel width)
let groupsDragStartRight = 0;
splitCodeGroups.addEventListener('mousedown', () => {
  groupsDragStartRight = groupsPanel.getBoundingClientRect().right;
});
initSplitter(splitCodeGroups, 'v', (e) => {
  const newWidth = groupsDragStartRight - e.clientX;
  if (newWidth > 150 && newWidth < 600) {
    groupsPanel.style.width = newWidth + 'px';
  }
}, groupsPanel);

// 3. Code Editor / Output Console (vertical split)
let outDragStartTop = 0;
let outDragStartHeight = 0;
splitCodeOut.addEventListener('mousedown', () => {
  const rc = codeRunnerPanel.getBoundingClientRect();
  outDragStartTop = rc.top;
  outDragStartHeight = rc.height;
});
initSplitter(splitCodeOut, 'h', (e) => {
  if (outDragStartHeight === 0) return;
  const percent = ((e.clientY - outDragStartTop) / outDragStartHeight) * 100;
  if (percent > 10 && percent < 90) {
    codeEditorWrap.style.height = percent + '%';
  }
});

