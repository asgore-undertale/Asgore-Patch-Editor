
// ── Groups ─────────────────────────────────────
const GROUP_PALETTE = [
  '#ff6b6b', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7',
  '#cc5de8', '#f783ac', '#63e6be', '#74c0fc', '#e599f7',
];

function nextGroupColor() {
  const used = groups.map(g => g.color);
  for (const c of GROUP_PALETTE) {
    if (!used.includes(c)) return c;
  }
  return GROUP_PALETTE[groups.length % GROUP_PALETTE.length];
}

// ── Regex matching cache ───────────────────────
let fileAsciiStr = null;

function getFileString() {
  if (fileAsciiStr !== null) return fileAsciiStr;
  if (!dataView) return '';
  let str = "";
  const chunk = 8192;
  const tempView = new Uint8Array(dataView);
  mods.forEach((val, off) => tempView[off] = val);

  for (let i = 0; i < tempView.length; i += chunk) {
    str += String.fromCharCode.apply(null, tempView.subarray(i, i + chunk));
  }
  fileAsciiStr = str;
  return str;
}

// Build ASCII string for any file entry (used by multi-file regex)
function getFileStringForEntry(entry) {
  let str = "";
  const chunk = 8192;
  const tempView = new Uint8Array(entry.dataView);
  entry.mods.forEach((val, off) => tempView[off] = val);
  for (let i = 0; i < tempView.length; i += chunk) {
    str += String.fromCharCode.apply(null, tempView.subarray(i, i + chunk));
  }
  return str;
}

function recomputeRegexRanges() {
  for (const g of groups) {
    g.regexRanges = [];
    for (const rxDef of g.regexes) {
      try {
        let flags = rxDef.flags;
        if (!flags.includes('g')) flags += 'g';
        if (!flags.includes('d')) flags += 'd';
        const rx = new RegExp(rxDef.pattern, flags);

        let targetFiles = files;
        if (rxDef.fileIds && !rxDef.fileIds.includes('all')) {
          const targetIds = rxDef.fileIds.map(id => parseInt(id, 10));
          targetFiles = files.filter(f => targetIds.includes(f.id));
        }

        // Run regex against target files
        for (const fileEntry of targetFiles) {
          const str = getFileStringForEntry(fileEntry);
          let match;
          while ((match = rx.exec(str)) !== null) {
            if (match[0].length === 0) {
              rx.lastIndex++;
              continue;
            }
            let hasCaps = false;
            if (match.indices && match.length > 1) {
              for (let i = 1; i < match.length; i++) {
                if (match.indices[i]) {
                  const [startIdx, endIdx] = match.indices[i];
                  g.regexRanges.push({ fileId: fileEntry.id, start: startIdx, end: endIdx - 1 });
                  hasCaps = true;
                }
              }
            }
            if (!hasCaps) {
              g.regexRanges.push({ fileId: fileEntry.id, start: match.index, end: match.index + match[0].length - 1 });
            }
          }
        }
      } catch (e) {
        console.warn("Invalid regex in group", g.name, rxDef);
      }
    }
  }
  rebuildByteGroupColor();
}

const scheduleRecomputeRegex = debounce(() => {
  fileAsciiStr = null;
  recomputeRegexRanges();
  renderGroupsPanel();
  refreshRows();
}, 300);

function rebuildByteGroupColor() {
  byteGroupColor = new Map();
  for (const g of groups) {
    for (const r of g.ranges) {
      if (r.fileId && r.fileId !== activeFileId) continue;
      for (let i = r.start; i <= r.end; i++) byteGroupColor.set(i, g.color);
    }
    for (const r of g.regexRanges) {
      if (r.fileId && r.fileId !== activeFileId) continue;
      for (let i = r.start; i <= r.end; i++) byteGroupColor.set(i, g.color);
    }
  }
}

function createGroup(name, color) {
  const g = { id: nextGroupId++, name, color, ranges: [], regexes: [], regexRanges: [] };
  groups.push(g);
  renderGroupsPanel();
}

function deleteGroup(id) {
  groups = groups.filter(g => g.id !== id);
  rebuildByteGroupColor();
  renderGroupsPanel();
  refreshRows();
}

function assignSelectionToGroup(id) {
  if (selStart < 0) return;
  const g = groups.find(g => g.id === id);
  if (!g) return;
  const lo = Math.min(selStart, selEnd);
  const hi = Math.max(selStart, selEnd);
  g.ranges.push({ fileId: activeFileId, start: lo, end: hi });
  rebuildByteGroupColor();
  renderGroupsPanel();
  refreshRows();
}

function removeRangeFromGroup(groupId, rangeIdx) {
  const g = groups.find(g => g.id === groupId);
  if (!g) return;
  g.ranges.splice(rangeIdx, 1);
  rebuildByteGroupColor();
  renderGroupsPanel();
  refreshRows();
}

const groupsList = document.getElementById('groups-list');
const groupsEmpty = document.getElementById('groups-empty');
const btnAddGroup = document.getElementById('btn-add-group');
const btnExportAll = document.getElementById('btn-export-all');
const btnImportXlsx = document.getElementById('btn-import-xlsx');
const xlsxImportInput = document.getElementById('xlsx-import-input');

if (btnExportAll) {
  btnExportAll.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (groups.length === 0) return;
    groups.forEach(g => exportGroupToExcel(g));
  });
}

if (btnImportXlsx && xlsxImportInput) {
  btnImportXlsx.addEventListener('mousedown', (e) => {
    e.preventDefault();
    xlsxImportInput.click();
  });

  xlsxImportInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      // Also load into viewer
      if (typeof loadExcelToViewer === 'function') {
        loadExcelToViewer(files[0]);
      }
      await importGroupsFromExcel(files);
      xlsxImportInput.value = ''; // Reset for next time
    }
  });
}

function renderGroupsPanel() {
  groupsList.innerHTML = '';
  if (groups.length === 0) {
    groupsEmpty.style.display = '';
    if (btnExportAll) btnExportAll.style.display = 'none';
    // Import button stays visible so you can create groups via import
    return;
  }
  groupsEmpty.style.display = 'none';
  if (btnExportAll) btnExportAll.style.display = 'block';

  for (const g of groups) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.dataset.id = g.id;
    if (g.collapsed) card.classList.add('collapsed');

    // Header row
    const head = document.createElement('div');
    head.className = 'group-card-head';

    const toggle = document.createElement('div');
    toggle.className = 'group-collapse-toggle';
    toggle.textContent = '▼';
    head.appendChild(toggle);

    head.addEventListener('mousedown', (e) => {
      if (e.target.closest('.group-name') || e.target.closest('.group-swatch') || e.target.closest('button')) return;
      e.preventDefault();
      g.collapsed = !g.collapsed;
      renderGroupsPanel();
    });

    // Color swatch
    const swatch = document.createElement('div');
    swatch.className = 'group-swatch';
    swatch.style.background = g.color;
    swatch.title = 'Click to change color';
    swatch.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = g.color;
      picker.style.cssText = 'position:fixed;opacity:0;width:0;height:0;top:-999px;';
      document.body.appendChild(picker);
      picker.addEventListener('input', () => {
        g.color = picker.value;
        rebuildByteGroupColor();
        renderGroupsPanel();
        refreshRows();
      });
      picker.click();
      picker.addEventListener('change', () => picker.remove());
    });
    head.appendChild(swatch);

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'group-name';
    nameInput.value = g.name;
    nameInput.addEventListener('change', () => { g.name = nameInput.value; });
    nameInput.addEventListener('mousedown', e => e.stopPropagation());
    head.appendChild(nameInput);

    // Assign button
    const assignBtn = document.createElement('button');
    assignBtn.className = 'group-assign-btn';
    assignBtn.textContent = 'Assign';
    assignBtn.title = 'Assign current selection to this group';
    assignBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      assignSelectionToGroup(g.id);
    });
    head.appendChild(assignBtn);

    // Excel Export button
    const xlsxBtn = document.createElement('button');
    xlsxBtn.className = 'group-xlsx-btn';
    xlsxBtn.textContent = 'XLSX';
    xlsxBtn.title = 'Export this group to Excel (.xlsx)';
    xlsxBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      exportGroupToExcel(g);
    });
    head.appendChild(xlsxBtn);

    // Delete group button
    const delBtn = document.createElement('button');
    delBtn.className = 'group-del-btn';
    delBtn.textContent = '×';
    delBtn.title = 'Delete group';
    delBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteGroup(g.id);
    });
    head.appendChild(delBtn);

    card.appendChild(head);

    // Card Body (Collapsible)
    const body = document.createElement('div');
    body.className = 'group-card-body';
    card.appendChild(body);

    // Ranges list
    if (g.ranges.length > 0) {
      const rangesDiv = document.createElement('div');
      rangesDiv.className = 'group-ranges';
      g.ranges.forEach(({ start, end, fileId }, idx) => {
        const itemWrap = document.createElement('div');
        itemWrap.className = 'group-range-wrap';

        const line = document.createElement('div');
        line.className = 'group-range-item';

        const file = files.find(f => f.id === fileId);
        const fileNamePrefix = file ? `[${file.name}] ` : '';
        line.textContent = `${fileNamePrefix}0x${start.toString(16)} - 0x${end.toString(16)}`;

        const delRange = document.createElement('button');
        delRange.className = 'group-range-del';
        delRange.textContent = '×';
        delRange.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeRangeFromGroup(g.id, idx);
        });
        line.appendChild(delRange);
        itemWrap.appendChild(line);

        // Preview snippet
        const preview = document.createElement('div');
        preview.className = 'group-range-preview';
        if (file) {
          preview.textContent = file.getString(start, end);
        }
        itemWrap.appendChild(preview);
        rangesDiv.appendChild(itemWrap);
      });
      body.appendChild(rangesDiv);
    }

    // Regex section
    const regexSec = document.createElement('div');
    regexSec.className = 'group-regex-section';

    const regexList = document.createElement('div');
    regexList.className = 'group-regex-list';
    g.regexes.forEach((rx, idx) => {
      const item = document.createElement('div');
      item.className = 'group-regex-item';

      const labelInput = document.createElement('input');
      labelInput.className = 'group-name';
      labelInput.style.color = 'var(--accent)';
      labelInput.style.fontFamily = 'var(--font-mono)';
      labelInput.value = `/${rx.pattern}/${rx.flags}`;
      labelInput.addEventListener('mousedown', e => e.stopPropagation());
      labelInput.addEventListener('change', () => {
        const val = labelInput.value.trim();
        let pattern = val, flags = 'g';
        const m = val.match(/^\/(.+)\/([a-z]*)$/);
        if (m) { pattern = m[1]; flags = m[2]; }
        try {
          new RegExp(pattern, flags);
          g.regexes[idx] = { pattern, flags, fileIds: rx.fileIds };
          scheduleRecomputeRegex();
        } catch (err) { alert('Invalid regex: ' + err.message); }
      });

      const delRx = document.createElement('button');
      delRx.className = 'group-range-del';
      delRx.textContent = '×';
      delRx.addEventListener('mousedown', (e) => {
        e.preventDefault();
        g.regexes.splice(idx, 1);
        scheduleRecomputeRegex();
      });

      item.appendChild(labelInput);
      item.appendChild(delRx);
      regexList.appendChild(item);
    });
    if (g.regexes.length > 0) regexSec.appendChild(regexList);

    // Add Section
    const addSection = document.createElement('div');
    addSection.className = 'group-add-section';
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'group-add-toggle';
    toggleBtn.textContent = '+';
    addSection.appendChild(toggleBtn);

    const addForm = document.createElement('div');
    addForm.className = 'group-add-form';
    addForm.style.display = 'none';

    toggleBtn.onclick = () => {
      addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
      toggleBtn.textContent = addForm.style.display === 'none' ? '+' : '−';
    };

    addSection.appendChild(addForm);
    body.appendChild(regexSec);
    body.appendChild(addSection);

    groupsList.appendChild(card);
  }
}

btnAddGroup.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const color = nextGroupColor();
  const num = groups.length + 1;
  createGroup(`Group ${num}`, color);
});


function formatBytesToMixedString(sub, encStr) {
  let decodedStr = "";
  const enc = encStr || 'latin1';
  if (enc !== 'latin1' && enc !== 'iso-8859-1' && enc !== 'windows-1252') {
    let i = 0;
    const decoder = new TextDecoder(enc, { fatal: true });
    while (i < sub.length) {
      let valid = false;
      let display = '';
      for (let len = 1; len <= 4 && i + len <= sub.length; len++) {
        try {
          const ch = decoder.decode(sub.subarray(i, i + len));
          const code = ch.codePointAt(0);
          if (code >= 0x20 && code !== 0x7F && code !== 0xFFFD) {
            display = ch;
          } else {
            display = Array.from(sub.subarray(i, i + len)).map(b => `[${b.toString(16).padStart(2, '0').toUpperCase()}]`).join('');
          }
          valid = true;
          decodedStr += display;
          i += len;
          break;
        } catch (e) { }
      }
      if (!valid) {
        decodedStr += `[${sub[i].toString(16).padStart(2, '0').toUpperCase()}]`;
        i++;
      }
    }
  } else {
    for (let i = 0; i < sub.length; i++) {
      const b = sub[i];
      decodedStr += (b >= 0x20 && b !== 0x7F) ? String.fromCharCode(b) : `[${b.toString(16).padStart(2, '0').toUpperCase()}]`;
    }
  }
  return decodedStr;
}

function parseMixedStringToBytes(repStr, encStr) {
  const enc = encStr || 'latin1';
  const bytes = [];
  let i = 0;
  while (i < repStr.length) {
    if (repStr[i] === '[' && i + 3 < repStr.length && repStr[i+3] === ']') {
      const hexStr = repStr.substring(i+1, i+3);
      if (/^[0-9A-Fa-f]{2}$/.test(hexStr)) {
        bytes.push(parseInt(hexStr, 16));
        i += 4;
        continue;
      }
    }
    let char = repStr[i];
    let isSurrogate = false;
    if (i + 1 < repStr.length && char.charCodeAt(0) >= 0xD800 && char.charCodeAt(0) <= 0xDBFF) {
      char += repStr[i+1];
      isSurrogate = true;
    }
    let charBytes = [];
    if (enc === 'latin1' || enc === 'iso-8859-1' || enc === 'windows-1252') {
      charBytes.push(char.charCodeAt(0) & 0xFF);
    } else if (enc === 'utf-16le' || enc === 'utf-16be') {
      const isLE = enc === 'utf-16le';
      for (let j = 0; j < char.length; j++) {
        const code = char.charCodeAt(j);
        if (isLE) {
          charBytes.push(code & 0xFF, code >> 8);
        } else {
          charBytes.push(code >> 8, code & 0xFF);
        }
      }
    } else {
      charBytes = Array.from(new TextEncoder().encode(char));
    }
    bytes.push(...charBytes);
    i += isSurrogate ? 2 : 1;
  }
  return new Uint8Array(bytes);
}

/**
 * Exports a single group's matched ranges to an Excel file.
 * Each file referenced by the group gets its own sheet.
 */
function exportGroupToExcel(g) {
  if (typeof XLSX === 'undefined') {
    alert("Excel library (SheetJS) is not loaded. Please check your internet connection.");
    return;
  }

  const wb = XLSX.utils.book_new();
  const allRanges = [...g.ranges, ...g.regexRanges];

  if (allRanges.length === 0) {
    alert("This group has no ranges to export.");
    return;
  }

  // Group by file
  const fileMap = new Map();
  allRanges.forEach(r => {
    if (!fileMap.has(r.fileId)) fileMap.set(r.fileId, []);
    fileMap.get(r.fileId).push(r);
  });

  fileMap.forEach((ranges, fileId) => {
    const fileEntry = files.find(f => f.id === fileId);
    const fileName = fileEntry ? fileEntry.name : `File_${fileId}`;

    // Sort by offset
    ranges.sort((a, b) => a.start - b.start);

    const rowData = ranges.map(r => {
      let matchStr = "";
      if (fileEntry) {
        // Extract the content from the buffer + modifications
        const sub = new Uint8Array(r.end - r.start + 1);
        for (let i = 0; i < sub.length; i++) {
          const off = r.start + i;
          sub[i] = fileEntry.mods.has(off) ? fileEntry.mods.get(off) : fileEntry.buffer[off];
        }
        matchStr = formatBytesToMixedString(sub, fileEntry.encoding);
      }
      return {
        "Start Offset": `0x${formatOffset(r.start)}`,
        "End Offset": `0x${formatOffset(r.end)}`,
        "Match String": matchStr,
        "Replacement String": ""
      };
    });

    const ws = XLSX.utils.json_to_sheet(rowData);

    // Auto-size columns slightly
    ws['!cols'] = [
      { wch: 15 }, // Start
      { wch: 15 }, // End
      { wch: 40 }, // Match
      { wch: 40 }, // Replacement
    ];

    // Excel sheet name limit is 31 chars
    const sheetName = fileName.replace(/[\\/?*[\]]/g, '_').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  XLSX.writeFile(wb, `${g.name || 'Group'}_Export.xlsx`);
}

/**
 * Core logic to import groups from a SheetJS workbook object.
 */
function importFromWorkbook(workbook, groupName) {
  let g = groups.find(x => x.name.toLowerCase() === groupName.toLowerCase());
  if (!g) {
    const color = nextGroupColor();
    g = { id: nextGroupId++, name: groupName, color, ranges: [], regexes: [], regexRanges: [] };
    groups.push(g);
  } else {
    g.ranges = [];
  }

  const allRows = [];
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);
    const targetFile = files.find(f => {
      const sanitized = f.name.replace(/[\\/?*[\]]/g, '_').substring(0, 31);
      return sanitized.toLowerCase() === sheetName.toLowerCase();
    }) || files.find(f => f.name.toLowerCase() === sheetName.toLowerCase());

    if (targetFile) {
      jsonData.forEach(row => {
        allRows.push({ row, targetFile });
      });
    }
  });

  allRows.sort((a, b) => {
    const startA = parseInt(String(a.row["Start Offset"] || 0).replace(/^0x/i, ''), 16);
    const startB = parseInt(String(b.row["Start Offset"] || 0).replace(/^0x/i, ''), 16);
    return startB - startA;
  });

  allRows.forEach(({ row, targetFile }) => {
    const startVal = row["Start Offset"];
    const endVal = row["End Offset"];

    if (startVal !== undefined && endVal !== undefined) {
      const start = parseInt(String(startVal).replace(/^0x/i, ''), 16);
      const end = parseInt(String(endVal).replace(/^0x/i, ''), 16);

      if (!isNaN(start) && !isNaN(end)) {
        g.ranges.push({ fileId: targetFile.id, start, end });
        const replacement = row["Replacement String"];
        if (replacement !== undefined && replacement !== null && String(replacement).length > 0) {
          const repStr = String(replacement).trim();
          const bytes = parseMixedStringToBytes(repStr, targetFile.encoding);
          patchFile(targetFile.id, start, (end - start + 1), bytes);
        }
      }
    }
  });

  rebuildByteGroupColor();
  renderGroupsPanel();
  if (typeof refreshRows === 'function') refreshRows();
}

/**
 * Imports multiple XLSX files to create or update groups.
 */
async function importGroupsFromExcel(fileList) {
  if (typeof XLSX === 'undefined') {
    alert("Excel library (SheetJS) is not loaded.");
    return;
  }

  for (const file of fileList) {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const groupName = file.name.replace(/_Export\.xlsx$/i, '').replace(/\.xlsx$/i, '');
      importFromWorkbook(workbook, groupName);
    } catch (err) {
      console.error("Error importing XLSX:", file.name, err);
      alert(`Failed to import ${file.name}`);
    }
  }
}
