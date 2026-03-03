
  // ── File I/O ───────────────────────────────────
  function openFilePicker() {
    filePicker.click();
  }

  filePicker.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadBuffer(new Uint8Array(reader.result), file.name);
    };
    reader.readAsArrayBuffer(file);
    filePicker.value = '';
  });

  function loadBuffer(buf, name) {
    fileBuffer = buf;
    dataView = new Uint8Array(buf);     // shallow copy for editing
    fileName = name;
    totalRows = Math.ceil(buf.length / BYTES_PER_ROW);

    mods.clear();
    scheduleRecomputeRegex();
    matchOffsets = [];
    matchLengths = [];
    matchSetHex = new Set();
    activeMatchIdx = -1;
    selStart = -1;
    selEnd = -1;
    selAnchor = -1;
    isDragging = false;
    editNibble = -1;

    // UI updates
    fileNameEl.textContent = name;
    fileSizeEl.textContent = formatSize(buf.length);
    btnSave.disabled = false;
    btnSaveProj.disabled = false;
    statusMod.classList.add('hidden');
    updateStatus();
    clearSearch();

    // Switch to editor view
    welcomeScr.classList.add('hidden');
    hexEditor.classList.remove('hidden');

    // Setup virtualised scroll
    hexSpacer.style.height = (totalRows * ROW_HEIGHT) + 'px';
    hexRows.innerHTML = '';
    rowPool = [];
    renderVisibleRows();
  }

  function saveFile() {
    if (!dataView) return;
    // Apply modifications
    const out = new Uint8Array(dataView);
    mods.forEach((val, off) => { out[off] = val; });
    const blob = new Blob([out], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Project Save/Load ──────────────────────────
  btnOpenProj.addEventListener('click', () => projPicker.click());

  projPicker.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const proj = JSON.parse(text);
        if (proj.groups) {
          groups = proj.groups;
          // Refresh nextGroupId based on highest existing ID
          if (groups.length > 0) {
            nextGroupId = Math.max(...groups.map(g => g.id)) + 1;
          }
        }
        if (proj.code !== undefined) {
          codeInput.value = proj.code;
          if (typeof updateSyntaxHighlighting === 'function') {
            updateSyntaxHighlighting();
          }
        }
        rebuildByteGroupColor();
        scheduleRecomputeRegex();
        renderGroupsPanel();
        refreshRows();
      } catch (err) {
        alert("Failed to parse project file.\n\n" + err);
      }
    };
    reader.readAsText(file);
    projPicker.value = '';
  });

  btnSaveProj.addEventListener('click', () => {
    // We only save groups and the script. Note: file contents/modifications are NOT saved.
    const projectData = {
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        ranges: g.ranges,
        regexes: g.regexes || [],
        regexRanges: [] // regex matches are recomputed on load depending on loaded file
      })),
      code: codeInput.value
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (fileName ? fileName + '-' : '') + 'project.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

