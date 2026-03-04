
// ── Splitter Resizing Logic ────────────────────
const splitTreeHex = document.getElementById('split-tree-hex');
const splitHexCode = document.getElementById('split-hex-code');
const splitCodeGroups = document.getElementById('split-code-groups');
const splitCodeOut = document.getElementById('split-code-out');

const groupsPanel = document.getElementById('groups-panel');
const codeEditorWrap = document.querySelector('.code-editor-wrap');

function initSplitter(splitter, type, onDrag) {
  if (!splitter) return;
  let isDragging = false;

  splitter.addEventListener('mousedown', (e) => {
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
      refreshRows(); // Recalculate virtual rows exactly once on drop
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
});

// 1. Hex | Code Runner (adjust Code Runner width from the left)
let codeDragStartRight = 0;
splitHexCode.addEventListener('mousedown', () => {
  if (codePanelOpen) {
    codeDragStartRight = codeRunnerPanel.getBoundingClientRect().right;
  }
});
initSplitter(splitHexCode, 'v', (e) => {
  if (codePanelOpen) {
    const newWidth = codeDragStartRight - e.clientX;
    if (newWidth > 150 && newWidth < 800) {
      codeRunnerPanel.style.width = newWidth + 'px';
    }
  }
});

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
});

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

