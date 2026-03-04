
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

function renderGroupsPanel() {
  groupsList.innerHTML = '';
  if (groups.length === 0) {
    groupsEmpty.style.display = '';
    return;
  }
  groupsEmpty.style.display = 'none';

  for (const g of groups) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.dataset.id = g.id;

    // Header row
    const head = document.createElement('div');
    head.className = 'group-card-head';

    // Color swatch (click to change color)
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

    // Name input
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'group-name';
    nameInput.value = g.name;
    nameInput.addEventListener('change', () => { g.name = nameInput.value; });
    nameInput.addEventListener('mousedown', e => e.stopPropagation());

    // Assign button
    const assignBtn = document.createElement('button');
    assignBtn.className = 'group-assign-btn';
    assignBtn.textContent = 'Assign';
    assignBtn.title = 'Assign current selection to this group';
    assignBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      assignSelectionToGroup(g.id);
    });

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

    head.appendChild(swatch);
    head.appendChild(nameInput);
    head.appendChild(assignBtn);
    head.appendChild(delBtn);
    card.appendChild(head);

    // Ranges list
    if (g.ranges.length > 0) {
      const rangesDiv = document.createElement('div');
      rangesDiv.className = 'group-ranges';
      g.ranges.forEach(({ start, end }, idx) => {
        const itemWrap = document.createElement('div');
        itemWrap.className = 'group-range-wrap';

        const item = document.createElement('div');
        item.className = 'group-range-item';
        let fName = 'Unknown File';
        if (g.ranges[idx].fileId) {
          const f = files.find(x => x.id === g.ranges[idx].fileId);
          if (f) fName = f.name;
        }

        const label = document.createElement('span');
        const offsetStr = start === end
          ? `0x${formatOffset(start)}`
          : `0x${formatOffset(start)}–0x${formatOffset(end)}`;
        label.textContent = `${fName} [${offsetStr}]`;

        const rdel = document.createElement('button');
        rdel.className = 'group-range-del';
        rdel.textContent = '×';
        rdel.title = 'Remove range';
        rdel.addEventListener('mousedown', (e) => {
          e.preventDefault();
          removeRangeFromGroup(g.id, idx);
        });
        item.appendChild(label);
        item.appendChild(rdel);
        itemWrap.appendChild(item);

        // ASCII Preview
        const maxLen = 24;
        const len = end - start + 1;
        const previewLen = Math.min(len, maxLen);
        let previewText = '';
        for (let i = 0; i < previewLen; i++) {
          const val = getByteAt(start + i);
          previewText += isPrintable(val) ? String.fromCharCode(val) : '.';
        }
        if (len > maxLen) previewText += '...';

        if (previewText.length > 0) {
          const previewEl = document.createElement('div');
          previewEl.className = 'group-range-preview';
          previewEl.textContent = previewText;
          itemWrap.appendChild(previewEl);
        }

        rangesDiv.appendChild(itemWrap);
      });
      card.appendChild(rangesDiv);
    }

    // ── Existing regex list ──────────────────────
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
      labelInput.title = "Click to edit pattern";

      labelInput.addEventListener('mousedown', e => e.stopPropagation());
      labelInput.addEventListener('keydown', e => e.stopPropagation());
      labelInput.addEventListener('keyup', e => e.stopPropagation());
      labelInput.addEventListener('change', () => {
        const val = labelInput.value.trim();
        let pattern = val;
        let flags = 'g';
        const m = val.match(/^\/(.+)\/([a-z]*)$/);
        if (m) {
          pattern = m[1];
          flags = m[2];
        }
        try {
          new RegExp(pattern, flags);
          g.regexes[idx] = { pattern, flags, fileIds: rx.fileIds };
          scheduleRecomputeRegex();
        } catch (err) {
          alert('Invalid regex: ' + err.message);
          labelInput.value = `/${rx.pattern}/${rx.flags}`;
        }
      });

      const fileLabel = document.createElement('span');
      fileLabel.className = 'group-range-preview';
      fileLabel.style.marginLeft = '4px';
      if (rx.fileIds && !rx.fileIds.includes('all')) {
        const names = rx.fileIds.map(id => {
          const f = files.find(x => x.id == id);
          return f ? f.name : 'Unknown';
        });
        fileLabel.textContent = `[${names.join(', ')}]`;
      } else {
        fileLabel.textContent = '[All Files]';
      }

      const rdel = document.createElement('button');
      rdel.className = 'group-range-del';
      rdel.textContent = '×';
      rdel.title = 'Remove regex';
      rdel.addEventListener('mousedown', (e) => {
        e.preventDefault();
        g.regexes.splice(idx, 1);
        scheduleRecomputeRegex();
      });

      item.appendChild(labelInput);
      item.appendChild(fileLabel);
      item.appendChild(rdel);
      regexList.appendChild(item);
    });
    if (g.regexes.length > 0) regexSec.appendChild(regexList);

    // ── Unified "+" Add Section ──────────────────
    const addSection = document.createElement('div');
    addSection.className = 'group-add-section';

    // The form container (hidden by default)
    const addForm = document.createElement('div');
    addForm.className = 'group-add-form';
    addForm.style.display = 'none';

    // Mode tabs: Regex | Offset
    const modeTabs = document.createElement('div');
    modeTabs.className = 'group-add-tabs';

    const tabRegex = document.createElement('button');
    tabRegex.className = 'group-add-tab active';
    tabRegex.textContent = 'Regex';

    const tabOffset = document.createElement('button');
    tabOffset.className = 'group-add-tab';
    tabOffset.textContent = 'Offset Range';

    modeTabs.appendChild(tabRegex);
    modeTabs.appendChild(tabOffset);

    // --- Regex form ---
    const regexForm = document.createElement('div');
    regexForm.className = 'group-add-form-body';

    const regexAdd = document.createElement('div');
    regexAdd.className = 'group-regex-add';

    const rxFileSel = document.createElement('select');
    rxFileSel.className = 'group-regex-input group-regex-multi';
    rxFileSel.style.marginBottom = '4px';
    rxFileSel.multiple = true;
    rxFileSel.size = 3;
    rxFileSel.appendChild(new Option('All Files', 'all'));
    files.forEach(f => rxFileSel.appendChild(new Option(f.name, f.id)));

    const rxInput = document.createElement('input');
    rxInput.className = 'group-regex-input';
    rxInput.type = 'text';
    rxInput.placeholder = '/regex/gi';
    rxInput.addEventListener('mousedown', e => e.stopPropagation());
    rxInput.addEventListener('keydown', e => e.stopPropagation());
    rxInput.addEventListener('keyup', e => e.stopPropagation());

    const rxBtn = document.createElement('button');
    rxBtn.className = 'group-regex-btn';
    rxBtn.textContent = 'Add';
    rxBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const val = rxInput.value.trim();
      if (!val) return;
      let pattern = val;
      let flags = 'g';
      const m = val.match(/^\/(.+)\/([a-z]*)$/);
      if (m) {
        pattern = m[1];
        flags = m[2];
      }
      try {
        new RegExp(pattern, flags);
        const selectedOptions = Array.from(rxFileSel.selectedOptions).map(opt => opt.value);
        const fileIds = selectedOptions.length > 0 ? selectedOptions : ['all'];
        g.regexes.push({ pattern, flags, fileIds });
        rxInput.value = '';
        scheduleRecomputeRegex();
      } catch (err) {
        alert('Invalid regex: ' + err.message);
      }
    });

    rxInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        rxBtn.dispatchEvent(new MouseEvent('mousedown'));
      }
    });

    regexAdd.appendChild(rxFileSel);
    regexAdd.appendChild(rxInput);
    regexAdd.appendChild(rxBtn);
    regexForm.appendChild(regexAdd);

    // --- Offset form ---
    const offsetForm = document.createElement('div');
    offsetForm.className = 'group-add-form-body';
    offsetForm.style.display = 'none';

    const offsetRow = document.createElement('div');
    offsetRow.className = 'group-offset-add';

    const offFileSel = document.createElement('select');
    offFileSel.className = 'group-regex-input';
    offFileSel.style.marginBottom = '4px';
    files.forEach(f => offFileSel.appendChild(new Option(f.name, f.id)));
    if (activeFileId) offFileSel.value = activeFileId;

    const startIn = document.createElement('input');
    startIn.className = 'group-regex-input';
    startIn.type = 'text';
    startIn.placeholder = 'Start (hex)';
    startIn.addEventListener('mousedown', e => e.stopPropagation());
    startIn.addEventListener('keydown', e => e.stopPropagation());
    startIn.addEventListener('keyup', e => e.stopPropagation());

    const endIn = document.createElement('input');
    endIn.className = 'group-regex-input';
    endIn.type = 'text';
    endIn.placeholder = 'End (hex)';
    endIn.addEventListener('mousedown', e => e.stopPropagation());
    endIn.addEventListener('keydown', e => e.stopPropagation());
    endIn.addEventListener('keyup', e => e.stopPropagation());

    const offBtn = document.createElement('button');
    offBtn.className = 'group-regex-btn';
    offBtn.textContent = 'Add';
    offBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const sVal = startIn.value.trim().replace(/^0x/i, '');
      const eVal = endIn.value.trim().replace(/^0x/i, '');
      const s = parseInt(sVal, 16);
      const eEnd = parseInt(eVal, 16);
      const selectedFileId = parseInt(offFileSel.value, 10);
      if (isNaN(s) || isNaN(eEnd)) { alert('Enter valid hex offsets.'); return; }
      if (s > eEnd) { alert('Start must be ≤ End.'); return; }

      const fileEntry = files.find(f => f.id === selectedFileId);
      if (fileEntry && eEnd >= fileEntry.dataView.length) { alert('End offset exceeds file size.'); return; }

      g.ranges.push({ fileId: selectedFileId, start: s, end: eEnd });
      startIn.value = '';
      endIn.value = '';
      rebuildByteGroupColor();
      renderGroupsPanel();
      refreshRows();
    });

    const submitOnEnter = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        offBtn.dispatchEvent(new MouseEvent('mousedown'));
      }
    };
    startIn.addEventListener('keydown', submitOnEnter);
    endIn.addEventListener('keydown', submitOnEnter);

    offsetRow.appendChild(offFileSel);
    offsetRow.appendChild(startIn);
    offsetRow.appendChild(endIn);
    offsetRow.appendChild(offBtn);
    offsetForm.appendChild(offsetRow);

    // --- Tab switching ---
    tabRegex.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tabRegex.classList.add('active');
      tabOffset.classList.remove('active');
      regexForm.style.display = '';
      offsetForm.style.display = 'none';
    });

    tabOffset.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tabOffset.classList.add('active');
      tabRegex.classList.remove('active');
      offsetForm.style.display = '';
      regexForm.style.display = 'none';
    });

    // --- "+" Toggle Button ---
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'group-add-toggle';
    toggleBtn.textContent = '+';
    toggleBtn.title = 'Add regex pattern or offset range';
    toggleBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = addForm.style.display !== 'none';
      addForm.style.display = isOpen ? 'none' : '';
      toggleBtn.textContent = isOpen ? '+' : '−';
    });

    addForm.appendChild(modeTabs);
    addForm.appendChild(regexForm);
    addForm.appendChild(offsetForm);

    addSection.appendChild(toggleBtn);
    addSection.appendChild(addForm);
    regexSec.appendChild(addSection);

    card.appendChild(regexSec);

    groupsList.appendChild(card);
  }
}

btnAddGroup.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const color = nextGroupColor();
  const num = groups.length + 1;
  createGroup(`Group ${num}`, color);
});

