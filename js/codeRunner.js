
// ── Code Runner Panel ──────────────────────────
const btnToggleCode = document.getElementById('btn-toggle-code');
const btnRunCode = document.getElementById('btn-run-code');
codeInput = document.getElementById('code-input');
const codeOutput = document.getElementById('code-output');

let codePanelOpen = true;

btnToggleCode.addEventListener('click', () => {
  codePanelOpen = !codePanelOpen;
  if (codePanelOpen) {
    codeRunnerPanel.classList.remove('collapsed');
    btnToggleCode.textContent = '▼';
  } else {
    codeRunnerPanel.classList.add('collapsed');
    btnToggleCode.textContent = '▲';
  }
  // Let transition finish then re-measure virtual rows
  setTimeout(() => refreshRows(), 320);
});

function runUserCode() {
  const code = codeInput.value;
  codeOutput.textContent = '';
  codeOutput.className = '';

  // Create a simple print function
  const print = (...args) => {
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
    const str = getFileString();
    return str.substring(start, end + 1);
  };

  // A Proxy object to read/write bytes seamlessly
  // It reads from `mods` or `dataView`
  // It writes to `mods`
  const CONTENT = new Proxy({}, {
    get(target, prop) {
      if (prop === 'length') return dataView ? dataView.length : 0;
      const idx = Number(prop);
      if (Number.isInteger(idx)) return getByteAt(idx);
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

  // Build a FILES array for scripts to access all loaded files
  const filesPayload = files.map(f => {
    const fMods = f.id === activeFileId ? mods : f.mods;
    const fDataView = f.dataView;
    return {
      id: f.id,
      name: f.name,
      path: f.path,
      length: fDataView.length,
      getString(start, end) {
        let s = '';
        for (let i = start; i <= end && i < fDataView.length; i++) {
          const val = fMods.has(i) ? fMods.get(i) : fDataView[i];
          s += String.fromCharCode(val);
        }
        return s;
      },
      CONTENT: new Proxy({}, {
        get(target, prop) {
          if (prop === 'length') return fDataView.length;
          const idx = Number(prop);
          if (Number.isInteger(idx)) return fMods.has(idx) ? fMods.get(idx) : fDataView[idx];
          return Reflect.get(target, prop);
        },
        set(target, prop, value) {
          const idx = Number(prop);
          if (Number.isInteger(idx) && idx >= 0 && idx < fDataView.length) {
            fMods.set(idx, value & 0xFF);
            return true;
          }
          return Reflect.set(target, prop, value);
        }
      })
    };
  });

  // Prepare XLS payload (renamed from EXCEL as requested)
  let xlsPayload = {
    workbook: null,
    sheetNames: [],
    activeSheet: null,
    // Helper to get data for a specific sheet
    getSheet: (name) => {
      if (!currentExcelWorkbook) return [];
      const sheetName = name || (typeof currentSheetName !== 'undefined' ? currentSheetName : currentExcelWorkbook.SheetNames[0]);
      const ws = currentExcelWorkbook.Sheets[sheetName];
      return ws ? XLSX.utils.sheet_to_json(ws) : [];
    }
  };

  if (typeof currentExcelWorkbook !== 'undefined' && currentExcelWorkbook) {
    xlsPayload.workbook = currentExcelWorkbook;
    xlsPayload.sheetNames = currentExcelWorkbook.SheetNames;
    xlsPayload.activeSheet = typeof currentSheetName !== 'undefined' ? currentSheetName : currentExcelWorkbook.SheetNames[0];
  }

  try {
    // Execute via new Function to keep strict scope
    const fn = new Function('GROUPS', 'print', 'getString', 'CONTENT', 'FILES', 'XLS', code);
    fn(groupsPayload, print, getString, CONTENT, filesPayload, xlsPayload);

    // In case CONTENT was modified (in any file), update UI
    if (files.some(f => f.mods.size > 0)) {
      if (mods.size > 0) {
        statusMod.classList.remove('hidden');
      }
      scheduleRecomputeRegex();
      refreshRows();
      updateStatus();
    }

    if (codeOutput.textContent === '') {
      print("Script executed successfully (no output).");
    }
  } catch (err) {
    codeOutput.className = 'error';
    codeOutput.textContent += `Error: ${err.message}\n`;
    if (err.stack) {
      codeOutput.textContent += err.stack.split('\n')[1] || '';
    }
  }
}

btnRunCode.addEventListener('click', runUserCode);

codeInput.addEventListener('keydown', (e) => {
  e.stopPropagation(); // prevent hex editor hotkeys from stealing focus
  // Ctrl+Enter shortcut within text area
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runUserCode();
  }
});

// Stop propagation on textarea so we can type shortcuts normally
codeInput.addEventListener('keyup', (e) => e.stopPropagation());
codeInput.addEventListener('mousedown', (e) => e.stopPropagation());

// ── Syntax Highlighting Sync ───────────────────
const codeOverlay = document.getElementById('code-overlay');

function updateSyntaxHighlighting() {
  let text = codeInput.value;
  // Handle final newlines to prevent scroll jumping
  if (text[text.length - 1] === '\n') {
    text += ' ';
  }
  // Update the code block
  codeOverlay.textContent = text;
  // If Prism is loaded, apply highlighting
  if (window.Prism) {
    Prism.highlightElement(codeOverlay);
  }
}

// Sync scrolling between textarea and pre
codeInput.addEventListener('scroll', () => {
  codeOverlay.parentElement.scrollTop = codeInput.scrollTop;
  codeOverlay.parentElement.scrollLeft = codeInput.scrollLeft;
});

// Sync content on input
codeInput.addEventListener('input', () => {
  updateSyntaxHighlighting();
});

// Initial highlight
updateSyntaxHighlighting();

