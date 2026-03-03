
  // ── Splitter Resizing Logic ────────────────────
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
      // Let editor re-layout virtual rows smoothly during drag
      requestAnimationFrame(refreshRows);
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        splitter.classList.remove('dragging');
        document.body.style.cursor = '';
        refreshRows(); // final snap
      }
    });
  }

  // 1. Hex | Code Runner (adjust Code Runner width from the left)
  // When dragging this, we change the width of the code-runner-panel.
  // Because it's pushed against the groups panel, increasing its width expands it to the left.
  initSplitter(splitHexCode, 'v', (e) => {
    if (codePanelOpen) {
      // Container right edge minus mouse X = new width
      const rc = codeRunnerPanel.getBoundingClientRect();
      const newWidth = rc.right - e.clientX;
      if (newWidth > 150 && newWidth < 800) {
        codeRunnerPanel.style.width = newWidth + 'px';
      }
    }
  });

  // 2. Code Runner | Groups Panel (adjust Groups Panel width)
  initSplitter(splitCodeGroups, 'v', (e) => {
    const rc = groupsPanel.getBoundingClientRect();
    const newWidth = rc.right - e.clientX;
    if (newWidth > 150 && newWidth < 600) {
      groupsPanel.style.width = newWidth + 'px';
    }
  });

  // 3. Code Editor / Output Console (vertical split)
  initSplitter(splitCodeOut, 'h', (e) => {
    const rc = codeRunnerPanel.getBoundingClientRect();
    const percent = ((e.clientY - rc.top) / rc.height) * 100;
    if (percent > 10 && percent < 90) {
      codeEditorWrap.style.height = percent + '%';
    }
  });

