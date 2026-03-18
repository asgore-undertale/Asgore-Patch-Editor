// ── Code Runner Panel ──────────────────────────
let btnToggleCode, btnRunCode, codeOutput, tabsBar, btnAddScript, codeOverlay;

function initCodeRunner() {
  // Get DOM elements inside init to ensure they exist
  btnToggleCode = document.getElementById('btn-toggle-code');
  btnRunCode = document.getElementById('btn-run-code');
  codeInput = document.getElementById('code-input');
  codeOutput = document.getElementById('code-output');
  tabsBar = document.getElementById('code-tabs-bar');
  btnAddScript = document.getElementById('btn-add-script');
  codeOverlay = document.getElementById('code-overlay');

  if (btnToggleCode) {
    btnToggleCode.addEventListener('click', () => {
      codePanelOpen = !codePanelOpen;
      if (codePanelOpen) {
        codeRunnerPanel.classList.remove('collapsed');
        btnToggleCode.textContent = '▼';
      } else {
        codeRunnerPanel.classList.add('collapsed');
        btnToggleCode.textContent = '▲';
      }
      setTimeout(() => { if (typeof refreshRows === 'function') refreshRows(); }, 320);
    });
  }

  if (btnRunCode) btnRunCode.addEventListener('click', runUserCode);

  if (btnAddScript) {
    btnAddScript.onclick = () => {
      const id = Date.now();
      scripts.push({ id, name: `Script ${scripts.length + 1}`, code: '// New script\n' });
      switchScript(id);
    };
  }

  if (codeInput) {
    codeInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runUserCode();
      }
    });
    codeInput.addEventListener('keyup', (e) => e.stopPropagation());
    codeInput.addEventListener('mousedown', (e) => e.stopPropagation());
    codeInput.addEventListener('input', updateSyntaxHighlighting);
    codeInput.addEventListener('scroll', () => {
      if (codeOverlay && codeOverlay.parentElement) {
        codeOverlay.parentElement.scrollTop = codeInput.scrollTop;
        codeOverlay.parentElement.scrollLeft = codeInput.scrollLeft;
      }
    });

    // Initial value
    if (scripts.length > 0 && activeScriptId) {
      const active = scripts.find(s => s.id === activeScriptId);
      if (active) codeInput.value = active.code;
    }
  }

  // Initialize scripts if needed
  if (scripts.length === 0) {
    scripts.push({
      id: 1,
      name: 'Redact Matches',
      code: `// GROUPS[i] gives access to group 'i'. Read .ranges or .regexRanges.
// Use FILES array to access specific files (e.g. FILES[0].getString, FILES[0].CONTENT).
if (GROUPS.length > 0) {
  const g = GROUPS[0];
  const allRanges = [...g.ranges, ...g.regexRanges];
  
  if (allRanges.length === 0) {
    print('Group "' + g.name + '" has no matches.');
  } else {
    allRanges.forEach((r, idx) => {
      const file = FILES.find(f => f.id === r.fileId);
      if (!file) return;

      const text = file.getString(r.start, r.end);
      print('[' + file.name + '] 0x' + r.start.toString(16) + ' - ' + (r.end).toString(16) + ': "' + text + '" -> Redacted');
      
      // Example Modification: Overwrite matched bytes with '*' (0x2A)
      for (let i = r.start; i <= r.end; i++) {
        file.CONTENT[i] = 0x2A; 
      }
    });
    print("Check the Hex Editor, the modified bytes should now be red and display *!");
  }
} else {
  print("No groups created yet. Create one and assign some bytes or write a regex pattern!");
}`
    });

    scripts.push({
      id: 2,
      name: 'Excel Importer',
      code: `// Asgore Script Runner
// Use XLS.sheetNames to loop through all sheets
// Use XLS.getSheet(name) to get data rows

if (XLS.sheetNames.length > 0) {
  print("Found " + XLS.sheetNames.length + " sheets.");
  
  XLS.sheetNames.forEach(name => {
    print("--- Sheet: " + name + " ---");
    const data = XLS.getSheet(name);
    
    // Example: Only print first 2 rows of each sheet
    data.slice(0, 2).forEach((row, i) => {
      print('Row ' + i + ':', JSON.stringify(row));
    });
  });
} else {
  print("No Excel file loaded.");
}`
    });

    scripts.push({
      id: 3,
      name: 'Custom Excel Export',
      code: `// Custom Excel Export Sample
// This script demonstrates how to create and download an Excel file with a custom schema.
// It uses the SheetJS (XLSX) library which is already available in the global scope.

if (typeof XLSX === 'undefined') {
  print("Excel library (SheetJS) is not loaded.");
} else if (GROUPS.length === 0) {
  print("Create at least one Byte Group first to export it.");
} else {
  const wb = XLSX.utils.book_new();
  const exportData = [];

  // Define a custom schema: Group Name, File Name, Offset Range, Preview
  GROUPS.forEach(g => {
    const allRanges = [...g.ranges, ...g.regexRanges];
    allRanges.forEach(r => {
      const file = FILES.find(f => f.id === r.fileId);
      const fileName = file ? file.name : "Unknown";
      const preview = file ? file.getString(r.start, r.end) : "";
      
      exportData.push({
        "Group": g.name,
        "File": fileName,
        "Range": '0x' + r.start.toString(16) + ' - 0x' + r.end.toString(16),
        "Content": preview
      });
    });
  });

  if (exportData.length === 0) {
    print("No matches in any groups to export.");
  } else {
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, "Matches");
    
    // Trigger download
    XLSX.writeFile(wb, "custom_export.xlsx");
    print("Custom Excel export triggered: custom_export.xlsx");
  }
}`
    });

    activeScriptId = 1;
    if (codeInput) codeInput.value = scripts[0].code;
  }

  renderScriptTabs();
  updateStatus(); // from globals
  updateSyntaxHighlighting();
}

let codePanelOpen = true;

// ── Script Tabs ────────────────────────────────
function renderScriptTabs() {
  if (!tabsBar || !btnAddScript) return;
  // Clear all but the "+" button
  Array.from(tabsBar.querySelectorAll('.code-tab')).forEach(t => t.remove());

  scripts.forEach(s => {
    const tab = document.createElement('button');
    tab.className = 'code-tab';
    if (s.id === activeScriptId) tab.classList.add('active');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'code-tab-name';
    nameSpan.textContent = s.name;
    tab.appendChild(nameSpan);

    const delBtn = document.createElement('span');
    delBtn.className = 'btn-del-script';
    delBtn.textContent = '×';
    delBtn.title = 'Delete script';
    delBtn.onclick = (e) => {
      e.stopPropagation();
      deleteScript(s.id);
    };
    tab.appendChild(delBtn);

    tab.onclick = () => switchScript(s.id);

    // Rename on double click
    tab.ondblclick = (e) => {
      e.preventDefault();
      const newName = prompt('New script name:', s.name);
      if (newName && newName.trim()) {
        s.name = newName.trim();
        renderScriptTabs();
      }
    };

    tabsBar.insertBefore(tab, btnAddScript);
  });
}

function switchScript(id) {
  if (id === activeScriptId) return;

  // Save current script code
  const current = scripts.find(s => s.id === activeScriptId);
  if (current && codeInput) {
    current.code = codeInput.value;
  }

  activeScriptId = id;
  const next = scripts.find(s => s.id === id);
  if (next && codeInput) {
    codeInput.value = next.code || '';
    updateSyntaxHighlighting();
  }
  renderScriptTabs();
}

function deleteScript(id) {
  if (scripts.length <= 1) return; // Keep at least one
  const idx = scripts.findIndex(s => s.id === id);
  scripts.splice(idx, 1);
  if (activeScriptId === id) {
    switchScript(scripts[0].id);
  } else {
    renderScriptTabs();
  }
}

function runUserCode() {
  const current = scripts.find(s => s.id === activeScriptId);
  if (current && codeInput) {
    current.code = codeInput.value; // ensure synced
  }
  const code = codeInput ? codeInput.value : '';
  if (codeOutput) codeOutput.textContent = '';
  if (codeOutput) codeOutput.className = '';

  // Create a simple print function
  const print = (...args) => {
    if (!codeOutput) return;
    const line = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
    codeOutput.textContent += line + '\n';
    codeOutput.scrollTop = codeOutput.scrollHeight;
  };

  // Prepare the GROUPS payload safely
  const groupsPayload = groups.map(g => ({
    id: g.id,
    name: g.name,
    color: g.color,
    ranges: JSON.parse(JSON.stringify(g.ranges)),
    regexRanges: JSON.parse(JSON.stringify(g.regexRanges))
  }));

  const getString = (start, end) => {
    if (typeof getFileString === 'function') {
      const str = getFileString();
      return str.substring(start, end + 1);
    }
    return "";
  };

  const CONTENT = new Proxy({}, {
    get(target, prop) {
      if (prop === 'length') return dataView ? dataView.length : 0;
      const idx = Number(prop);
      if (Number.isInteger(idx)) return typeof getByteAt === 'function' ? getByteAt(idx) : 0;
      return Reflect.get(target, prop);
    },
    set(target, prop, value) {
      const idx = Number(prop);
      if (Number.isInteger(idx)) {
        if (dataView && idx >= 0 && idx < dataView.length) {
          mods.set(idx, value & 0xFF);
        }
        return true;
      }
      return Reflect.set(target, prop, value);
    }
  });

  let oobCount = 0;
  const maxOobWarnings = 10;

  // Build a FILES array for scripts to access all loaded files
  const filesPayload = files.map(f => {
    const fMods = f.id === activeFileId ? mods : f.mods;
    const fDataView = f.dataView;
    return {
      id: f.id,
      name: f.name,
      path: f.path,
      encoding: f.encoding || 'latin1',
      length: fDataView ? fDataView.length : 0,
      getString(start, end) {
        if (!fDataView) return "";
        const len = Math.min(end, fDataView.length - 1) - start + 1;
        if (len <= 0) return '';
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          const off = start + i;
          bytes[i] = fMods.has(off) ? fMods.get(off) : fDataView[off];
        }
        try {
          return new TextDecoder(f.encoding || 'latin1').decode(bytes);
        } catch (e) {
          return new TextDecoder('latin1').decode(bytes);
        }
      },
      CONTENT: new Proxy({}, {
        get(target, prop) {
          if (!fDataView) return 0;
          if (prop === 'length') return fDataView.length;
          const idx = typeof prop === 'string' && prop.startsWith('0x') ? parseInt(prop, 16) : Number(prop);
          if (Number.isInteger(idx)) return fMods.has(idx) ? fMods.get(idx) : fDataView[idx];
          return Reflect.get(target, prop);
        },
        set(target, prop, value) {
          if (!fDataView) return false;
          const idx = typeof prop === 'string' && prop.startsWith('0x') ? parseInt(prop, 16) : Number(prop);
          if (Number.isInteger(idx)) {
            if (idx >= 0 && idx < fDataView.length) {
              fMods.set(idx, value & 0xFF);
              return true;
            } else {
              if (oobCount < maxOobWarnings) {
                print(`Warning: Out of bounds write at index 0x${idx.toString(16)} (File length: 0x${fDataView.length.toString(16)})`);
              }
              oobCount++;
              return true;
            }
          }
          return Reflect.set(target, prop, value);
        }
      })
    };
  });

  let xlsPayload = {
    workbook: null,
    sheetNames: [],
    activeSheet: null,
    getSheet: (name) => {
      if (typeof currentExcelWorkbook === 'undefined' || !currentExcelWorkbook) return [];
      const sheetName = name || (typeof currentSheetName !== 'undefined' ? currentSheetName : currentExcelWorkbook.SheetNames[0]);
      const ws = currentExcelWorkbook.Sheets[sheetName];
      if (!ws) return [];
      const rows = XLSX.utils.sheet_to_json(ws);
      return rows.map(row => {
        const entry = {};
        for (let key in row) {
          let val = row[key];
          if (typeof val === 'string') {
            const trimmed = val.trim();
            if (trimmed.startsWith('0x')) {
              const parsed = parseInt(trimmed, 16);
              if (!isNaN(parsed)) val = parsed;
            } else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
              const parsed = parseFloat(trimmed);
              if (!isNaN(parsed)) val = parsed;
            }
          }
          entry[key] = val;
        }
        return entry;
      });
    }
  };

  if (typeof currentExcelWorkbook !== 'undefined' && currentExcelWorkbook) {
    xlsPayload.workbook = currentExcelWorkbook;
    xlsPayload.sheetNames = currentExcelWorkbook.SheetNames;
    xlsPayload.activeSheet = typeof currentSheetName !== 'undefined' ? currentSheetName : currentExcelWorkbook.SheetNames[0];
  }

  try {
    const fn = new Function('GROUPS', 'print', 'getString', 'CONTENT', 'FILES', 'XLS', code);
    fn(groupsPayload, print, getString, CONTENT, filesPayload, xlsPayload);

    const anyModified = mods.size > 0 || files.some(f => f.mods && f.mods.size > 0);
    if (mods.size > 0 && statusMod) statusMod.classList.remove('hidden');

    if (anyModified) {
      if (typeof scheduleRecomputeRegex === 'function') scheduleRecomputeRegex();
      if (typeof refreshRows === 'function') refreshRows();
      if (typeof updateStatus === 'function') updateStatus();
    }

    groupsPayload.forEach((gData, idx) => {
      if (groups[idx]) {
        groups[idx].ranges = gData.ranges;
        groups[idx].regexRanges = gData.regexRanges;
      }
    });

    if (typeof rebuildByteGroupColor === 'function') rebuildByteGroupColor();
    if (typeof renderGroupsPanel === 'function') renderGroupsPanel();
    if (typeof scheduleRecomputeRegex === 'function') scheduleRecomputeRegex();
    if (typeof refreshRows === 'function') refreshRows();
    if (typeof updateStatus === 'function') updateStatus();

    if (oobCount > maxOobWarnings) {
      print(`... and ${oobCount - maxOobWarnings} more out-of-bounds warnings suppressed.`);
    }
    if (codeOutput && codeOutput.textContent === '' && !anyModified) {
      print("Script executed successfully (no output).");
    }
  } catch (err) {
    if (codeOutput) {
      codeOutput.className = 'error';
      codeOutput.textContent += `Error: ${err.message}\n`;
      if (err.stack) codeOutput.textContent += err.stack.split('\n')[1] || '';
    }
  }
}

function updateSyntaxHighlighting() {
  if (!codeInput || !codeOverlay) return;
  let text = codeInput.value;
  if (text[text.length - 1] === '\n') text += ' ';
  codeOverlay.textContent = text;
  if (window.Prism) Prism.highlightElement(codeOverlay);
}

// Start it up
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCodeRunner);
} else {
  initCodeRunner();
}
