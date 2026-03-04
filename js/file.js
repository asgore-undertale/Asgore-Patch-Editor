
// ── File I/O ───────────────────────────────────
// loadBuffer is now a thin wrapper that adds a file and switches to it
function loadBuffer(buf, name, path) {
  const id = addFile(buf, name, path || name);
  switchToFile(id);
}

function saveFile() {
  if (!dataView) return;
  // Apply modifications to active file
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
const opProj = document.getElementById('btn-open-proj');
if (opProj) {
  opProj.addEventListener('click', () => {
    const picker = document.getElementById('proj-picker');
    if (picker) picker.click();
  });
}

const pPickerEl = document.getElementById('proj-picker');
if (pPickerEl) {
  pPickerEl.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target.result;
        const proj = JSON.parse(text);
        if (proj.groups) {
          groups = proj.groups;
          // Ensure all ranges have a fileId (backward compat)
          for (const g of groups) {
            for (const r of g.ranges) {
              if (!r.fileId && activeFileId) r.fileId = activeFileId;
            }
          }
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

        // Switch UI to hex editor
        if (welcomeScr && hexEditor) {
          welcomeScr.classList.add('hidden');
          hexEditor.classList.remove('hidden');
        }
      } catch (err) {
        alert("Failed to parse project file.\n\n" + err);
      }
    };
    reader.readAsText(file);
    projPicker.value = '';
  });
}

const svProj = document.getElementById('btn-save-proj');
if (svProj) {
  svProj.addEventListener('click', () => {
    const projectData = {
      groups: groups.map(g => ({
        id: g.id,
        name: g.name,
        color: g.color,
        ranges: g.ranges,
        regexes: g.regexes || [],
        regexRanges: []
      })),
      code: codeInput.value
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'project.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}
