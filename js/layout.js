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
    // Hex rows need refresh after the transition to expand/contract
    setTimeout(() => { if (typeof refreshRows === 'function') refreshRows(); }, 320);
  });
}

// Attach toggles
setupToggle(btnToggleTree, fileTreePanel, splitTreeHex, '◀', '▶');
setupToggle(btnToggleExcel, excelViewerPanel, splitHexExcel, '◀', '▶');
setupToggle(btnToggleGroups, groupsPanel, splitCodeGroups, '▶', '◀');

function initSplitter(splitter, type, onDrag, panel) {
  if (!splitter) return;
  let isDragging = false;

  splitter.addEventListener('mousedown', (e) => {
    // Don't drag if panel is collapsed
    if (panel && panel.classList.contains('collapsed')) return;
    isDragging = true;
    splitter.classList.add('dragging');
    document.body.style.cursor = type === 'v' ? 'col-resize' : 'row-resize';
    e.preventDefault();
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
      if (typeof refreshRows === 'function') refreshRows();
    }
  });
}

// 0. File Tree | Hex
if (splitTreeHex && fileTreePanel) {
  let treeDragStartLeft = 0;
  splitTreeHex.addEventListener('mousedown', () => {
    treeDragStartLeft = fileTreePanel.getBoundingClientRect().left;
  });
  initSplitter(splitTreeHex, 'v', (e) => {
    const newWidth = e.clientX - treeDragStartLeft;
    if (newWidth > 40 && newWidth < 500) {
      fileTreePanel.style.width = newWidth + 'px';
    }
  }, fileTreePanel);
}

// 1. Hex | Excel Viewer
if (splitHexExcel && excelViewerPanel) {
  let excelDragStartRight = 0;
  splitHexExcel.addEventListener('mousedown', () => {
    const rect = excelViewerPanel.getBoundingClientRect();
    excelDragStartRight = rect.right;
  });
  initSplitter(splitHexExcel, 'v', (e) => {
    const newWidth = excelDragStartRight - e.clientX;
    if (newWidth > 40 && newWidth < 1200) {
      excelViewerPanel.style.width = newWidth + 'px';
    }
  }, excelViewerPanel);
}

// 1.5 Excel Viewer | Code Runner
if (splitExcelCode && codeRunnerPanel) {
  let codeDragStartRight = 0;
  splitExcelCode.addEventListener('mousedown', () => {
    codeDragStartRight = codeRunnerPanel.getBoundingClientRect().right;
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
}

// 2. Code Runner | Groups Panel
if (splitCodeGroups && groupsPanel) {
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
}

// 3. Code Editor / Output Console (vertical)
if (splitCodeOut && codeEditorWrap && codeRunnerPanel) {
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
}

