/* ═══════════════════════════════════════════════════
   Asgore Patch Editor — Core Logic
   ═══════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── Constants ──────────────────────────────────
  const BYTES_PER_ROW = 16;
  const ROW_HEIGHT = 22;        // matches CSS --row-h
  const RENDER_PAD = 8;         // extra rows above/below viewport

  // ── DOM refs ───────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const filePicker = $('#file-picker');
  const btnOpen = $('#btn-open');
  const btnSave = $('#btn-save');
  const btnOpenProj = $('#btn-open-proj');
  const btnSaveProj = $('#btn-save-proj');
  const projPicker = $('#proj-picker');
  const btnWelcome = $('#btn-welcome-open');
  const welcomeScr = $('#welcome-screen');
  const hexEditor = $('#hex-editor');
  const hexScroll = $('#hex-scroll');
  const hexSpacer = $('#hex-spacer');
  const hexRows = $('#hex-rows');
  const fileNameEl = $('#file-name');
  const fileSizeEl = $('#file-size');
  const searchInput = $('#search-input');
  const searchMode = $('#search-mode');
  const btnPrev = $('#btn-search-prev');
  const btnNext = $('#btn-search-next');
  const searchRes = $('#search-results');
  const gotoInput = $('#goto-input');
  const gotoMode = $('#goto-mode');
  const statusPos = $('#status-position');
  const statusVal = $('#status-value');
  const statusMod = $('#status-modified');

  // ── State ──────────────────────────────────────
  let fileBuffer = null;       // Uint8Array
  let dataView = null;       // working copy (editable)
  let fileName = '';
  let totalRows = 0;

  let selStart = -1;         // selection range start offset
  let selEnd = -1;         // selection range end offset (inclusive)
  let selAnchor = -1;         // anchor for drag selection
  let isDragging = false;
  let activePane = 'hex';      // 'hex' or 'ascii'
  let editNibble = -1;         // 0 = high nibble typed, 1 = waiting for low

  // Modifications map: offset → new byte value
  const mods = new Map();

  // ── Global references to access later ──────────
  let codeInput; // assigned later in the file

  // Search state
  let matchOffsets = [];         // array of match start offsets
  let matchLengths = [];         // length of each match
  let matchSetHex = new Set();  // set of ALL individual byte offsets in matches
  let activeMatchIdx = -1;

  // Groups state: { id, name, color, ranges:[{start,end}] }[]
  let groups = [];
  let nextGroupId = 1;
  // Flat map: offset → group color (rebuilt on any group change)
  let byteGroupColor = new Map();

  // Virtualization bookkeeping
  let firstVisRow = 0;
  let lastVisRow = 0;
  let rowPool = [];          // recycled row elements

  // ── Helpers ────────────────────────────────────
  function hexByte(b) {
    return b.toString(16).toUpperCase().padStart(2, '0');
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1073741824).toFixed(2)} GB`;
  }

  function formatOffset(off) {
    return off.toString(16).toUpperCase().padStart(8, '0');
  }

  function isPrintable(c) {
    return c >= 0x20 && c <= 0x7e;
  }

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

  function recomputeRegexRanges() {
    const str = getFileString();
    for (const g of groups) {
      g.regexRanges = [];
      for (const rxDef of g.regexes) {
        try {
          let flags = rxDef.flags;
          if (!flags.includes('g')) flags += 'g';
          if (!flags.includes('d')) flags += 'd'; // Enable match.indices
          // Create new RegExp because 'g' flag makes it stateful
          const rx = new RegExp(rxDef.pattern, flags);
          let match;
          while ((match = rx.exec(str)) !== null) {
            if (match[0].length === 0) {
              rx.lastIndex++;
              continue;
            }

            // If there are capturing groups (match.length > 1), we ONLY highlight the captured portions.
            // (Note: JS RegExp execution does not natively give indices for sub-groups.
            // We use simple substring indexOf matching within the full match string as an approximation
            // because full match.indices requires the 'd' flag which isn't standard everywhere yet).
            let hasCaps = false;
            if (match.length > 1) {
              // Modern JS supports match.indices if 'd' flag is provided. For safety, let's use it
              // by enforcing 'd' flag on our internal expressions.
            }

            // Let's use the standard 'd' flag internally to get exact capture indices
            // If the user's browser lacks it, we fallback to full match.

            if (match.indices && match.length > 1) {
              for (let i = 1; i < match.length; i++) {
                if (match.indices[i]) {
                  const [startIdx, endIdx] = match.indices[i];
                  g.regexRanges.push({ start: startIdx, end: endIdx - 1 });
                  hasCaps = true;
                }
              }
            }
            if (!hasCaps) {
              g.regexRanges.push({ start: match.index, end: match.index + match[0].length - 1 });
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
      for (const { start, end } of g.ranges) {
        for (let i = start; i <= end; i++) byteGroupColor.set(i, g.color);
      }
      for (const { start, end } of g.regexRanges) {
        for (let i = start; i <= end; i++) byteGroupColor.set(i, g.color);
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
    // Merge or add range
    g.ranges.push({ start: lo, end: hi });
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
          const label = document.createElement('span');
          label.textContent = start === end
            ? `0x${formatOffset(start)}`
            : `0x${formatOffset(start)} – 0x${formatOffset(end)}`;
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

      // Regexes section
      const regexSec = document.createElement('div');
      regexSec.className = 'group-regex-section';

      const regexList = document.createElement('div');
      regexList.className = 'group-regex-list';
      g.regexes.forEach((rx, idx) => {
        const item = document.createElement('div');
        item.className = 'group-regex-item';

        // Editable input for regex pattern
        const labelInput = document.createElement('input');
        labelInput.className = 'group-name'; // Reuse styling
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
            new RegExp(pattern, flags); // Validate
            g.regexes[idx] = { pattern, flags };
            scheduleRecomputeRegex();
          } catch (err) {
            alert('Invalid regex: ' + err.message);
            labelInput.value = `/${rx.pattern}/${rx.flags}`; // Revert
          }
        });

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
        item.appendChild(rdel);
        regexList.appendChild(item);
      });
      if (g.regexes.length > 0) regexSec.appendChild(regexList);

      const regexAdd = document.createElement('div');
      regexAdd.className = 'group-regex-add';

      const rxInput = document.createElement('input');
      rxInput.className = 'group-regex-input';
      rxInput.type = 'text';
      rxInput.placeholder = '/regex/gi';

      rxInput.addEventListener('mousedown', e => e.stopPropagation());
      rxInput.addEventListener('keydown', e => e.stopPropagation());
      rxInput.addEventListener('keyup', e => e.stopPropagation());

      const rxBtn = document.createElement('button');
      rxBtn.className = 'group-regex-btn';
      rxBtn.textContent = 'Add Pattern';
      rxBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const val = rxInput.value.trim();
        if (!val) return;

        let pattern = val;
        let flags = 'g'; // default

        const m = val.match(/^\/(.+)\/([a-z]*)$/);
        if (m) {
          pattern = m[1];
          flags = m[2];
        }

        try {
          new RegExp(pattern, flags); // Validate
          g.regexes.push({ pattern, flags });
          rxInput.value = '';
          scheduleRecomputeRegex();
        } catch (err) {
          alert('Invalid regex: ' + err.message);
        }
      });

      // Allow pressing Enter in regex input
      rxInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          rxBtn.dispatchEvent(new MouseEvent('mousedown'));
        }
      });

      regexAdd.appendChild(rxInput);
      regexAdd.appendChild(rxBtn);
      regexSec.appendChild(regexAdd);

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

  // ── Virtualised rendering ──────────────────────
  function renderVisibleRows() {
    const scrollTop = hexScroll.scrollTop;
    const viewH = hexScroll.clientHeight;

    const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - RENDER_PAD);
    const last = Math.min(totalRows - 1, Math.ceil((scrollTop + viewH) / ROW_HEIGHT) + RENDER_PAD);

    if (first === firstVisRow && last === lastVisRow) return;
    firstVisRow = first;
    lastVisRow = last;

    const needed = last - first + 1;

    // Expand pool if needed
    while (rowPool.length < needed) {
      const el = createRowElement();
      hexRows.appendChild(el);
      rowPool.push(el);
    }

    // Hide excess rows, move them far out of view
    for (let i = needed; i < rowPool.length; i++) {
      rowPool[i].style.display = 'none';
    }

    // Populate visible rows — each row uses its absolute offset from the top of the file
    for (let i = 0; i < needed; i++) {
      const rowIdx = first + i;
      rowPool[i].style.top = (rowIdx * ROW_HEIGHT) + 'px';
      populateRow(rowPool[i], rowIdx);
      rowPool[i].style.display = '';
    }
  }

  function createRowElement() {
    const row = document.createElement('div');
    row.className = 'hex-row';

    // Offset
    const offEl = document.createElement('span');
    offEl.className = 'row-offset';
    row.appendChild(offEl);

    // Hex bytes
    const hexDiv = document.createElement('div');
    hexDiv.className = 'row-hex';
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      if (i === 8) {
        const gap = document.createElement('span');
        gap.className = 'hex-gap';
        hexDiv.appendChild(gap);
      }
      const b = document.createElement('span');
      b.className = 'hex-byte';
      hexDiv.appendChild(b);
    }
    row.appendChild(hexDiv);

    // ASCII
    const ascDiv = document.createElement('div');
    ascDiv.className = 'row-ascii';
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      const c = document.createElement('span');
      c.className = 'ascii-char';
      ascDiv.appendChild(c);
    }
    row.appendChild(ascDiv);

    return row;
  }

  function getByteAt(off) {
    if (mods.has(off)) return mods.get(off);
    return dataView[off];
  }

  function populateRow(el, rowIdx) {
    const baseOff = rowIdx * BYTES_PER_ROW;
    const maxOff = dataView.length;

    // Offset label
    el.children[0].textContent = formatOffset(baseOff);

    // Hex bytes
    const hexDiv = el.children[1];
    const hexSpans = hexDiv.querySelectorAll('.hex-byte');
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      const off = baseOff + i;
      const span = hexSpans[i];
      if (off < maxOff) {
        const val = getByteAt(off);
        span.textContent = hexByte(val);
        span.dataset.off = off;
        span.style.visibility = '';

        // Classes
        let cls = 'hex-byte';
        if (isInSelection(off)) {
          cls += ' selected';
          if (activePane === 'hex') cls += ' active-pane';
        }
        if (mods.has(off)) cls += ' modified';
        if (matchSetHex.has(off)) {
          cls += ' search-match';
          if (activeMatchIdx >= 0 && isInActiveMatch(off)) cls += ' search-active';
        }
        span.className = cls;
        // Group color highlight
        const gc = byteGroupColor.get(off);
        span.style.backgroundColor = gc ? gc + '55' : '';
        span.style.borderRadius = gc ? '2px' : '';
      } else {
        span.textContent = '';
        span.dataset.off = '';
        span.className = 'hex-byte';
        span.style.visibility = 'hidden';
        span.style.backgroundColor = '';
      }
    }

    // ASCII chars
    const ascDiv = el.children[2];
    const ascSpans = ascDiv.querySelectorAll('.ascii-char');
    for (let i = 0; i < BYTES_PER_ROW; i++) {
      const off = baseOff + i;
      const span = ascSpans[i];
      if (off < maxOff) {
        const val = getByteAt(off);
        const pr = isPrintable(val);
        span.textContent = pr ? String.fromCharCode(val) : '.';
        span.dataset.off = off;
        span.style.visibility = '';

        let cls = 'ascii-char';
        if (pr) cls += ' printable';
        if (isInSelection(off)) {
          cls += ' selected';
          if (activePane === 'ascii') cls += ' active-pane';
        }
        if (mods.has(off)) cls += ' modified';
        if (matchSetHex.has(off)) {
          cls += ' search-match';
          if (activeMatchIdx >= 0 && isInActiveMatch(off)) cls += ' search-active';
        }
        span.className = cls;
        // Group color highlight
        const gc2 = byteGroupColor.get(off);
        span.style.backgroundColor = gc2 ? gc2 + '55' : '';
        span.style.borderRadius = gc2 ? '2px' : '';
      } else {
        span.textContent = '';
        span.dataset.off = '';
        span.className = 'ascii-char';
        span.style.visibility = 'hidden';
      }
    }
  }

  function isInActiveMatch(off) {
    if (activeMatchIdx < 0) return false;
    const start = matchOffsets[activeMatchIdx];
    const len = matchLengths[activeMatchIdx];
    return off >= start && off < start + len;
  }

  function isInSelection(off) {
    if (selStart < 0) return false;
    const lo = Math.min(selStart, selEnd);
    const hi = Math.max(selStart, selEnd);
    return off >= lo && off <= hi;
  }

  // Force re-render all visible rows
  function refreshRows() {
    firstVisRow = -1;
    lastVisRow = -1;
    renderVisibleRows();
  }

  // ── Selection (mousedown / mousemove / mouseup) ──
  function getOffsetFromEvent(e) {
    const t = e.target;
    if (t.dataset.off === undefined && t.dataset.off !== '0') return -1;
    const off = parseInt(t.dataset.off, 10);
    return isNaN(off) ? -1 : off;
  }

  hexRows.addEventListener('mousedown', (e) => {
    const off = getOffsetFromEvent(e);
    if (off < 0 || !dataView) return;
    e.preventDefault();

    if (e.target.classList.contains('ascii-char')) {
      activePane = 'ascii';
    } else if (e.target.classList.contains('hex-byte')) {
      activePane = 'hex';
    }

    if (e.shiftKey && selStart >= 0) {
      // Extend selection from anchor
      selEnd = off;
    } else {
      selStart = off;
      selEnd = off;
      selAnchor = off;
    }
    isDragging = true;
    editNibble = -1;
    updateStatus();
    refreshRows();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const off = getOffsetFromEvent(e);
    if (off < 0) return;
    selEnd = off;
    updateStatus();
    refreshRows();
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  function selectByte(off, pane = activePane) {
    if (off < 0 || off >= dataView.length) return;
    selStart = off;
    selEnd = off;
    selAnchor = off;
    activePane = pane;
    editNibble = -1;
    updateStatus();
    refreshRows();
  }

  // ── Editing ────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Keyboard shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      openFilePicker();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveFile();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      gotoInput.focus();
      gotoInput.select();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }

    // Copy selected bytes
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      if (!dataView || selStart < 0) return;
      const lo = Math.min(selStart, selEnd);
      const hi = Math.max(selStart, selEnd);

      if (activePane === 'hex') {
        const hexParts = [];
        for (let i = lo; i <= hi; i++) {
          hexParts.push(hexByte(getByteAt(i)));
        }
        navigator.clipboard.writeText(hexParts.join(' ')).catch(() => { });
      } else {
        const chars = [];
        for (let i = lo; i <= hi; i++) {
          const val = getByteAt(i);
          chars.push(isPrintable(val) ? String.fromCharCode(val) : '.');
        }
        navigator.clipboard.writeText(chars.join('')).catch(() => { });
      }
      return;
    }

    // Paste data at selection
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault();
      if (!dataView || selStart < 0) return;
      navigator.clipboard.readText().then((text) => {
        if (!text) return;
        const lo = Math.min(selStart, selEnd);

        if (activePane === 'hex') {
          const clean = text.replace(/[\s,]+/g, '');
          if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length === 0 || clean.length % 2 !== 0) return;
          const byteCount = clean.length / 2;
          for (let i = 0; i < byteCount && (lo + i) < dataView.length; i++) {
            const val = parseInt(clean.substr(i * 2, 2), 16);
            mods.set(lo + i, val);
          }
        } else {
          for (let i = 0; i < text.length && (lo + i) < dataView.length; i++) {
            mods.set(lo + i, text.charCodeAt(i));
          }
        }
        statusMod.classList.remove('hidden');
        scheduleRecomputeRegex();
        refreshRows();
        updateStatus();
      }).catch(() => { });
      return;
    }

    // If focus is on an input, don't capture hex editing keys
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
    if (!dataView || selStart < 0) return;

    // Arrow navigation
    if (e.key === 'ArrowRight') { e.preventDefault(); selectByte(selEnd + 1); scrollToOffset(selEnd); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); selectByte(selEnd - 1); scrollToOffset(selEnd); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); selectByte(selEnd + BYTES_PER_ROW); scrollToOffset(selEnd); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); selectByte(selEnd - BYTES_PER_ROW); scrollToOffset(selEnd); return; }

    // Tab → move to next byte
    if (e.key === 'Tab') {
      e.preventDefault();
      activePane = activePane === 'hex' ? 'ascii' : 'hex';
      selectByte(selEnd, activePane);
      scrollToOffset(selEnd);
      return;
    }

    // Hex digit input
    if (activePane === 'hex') {
      const hexDigit = parseInt(e.key, 16);
      if (!isNaN(hexDigit) && e.key.length === 1 && /^[0-9a-fA-F]$/.test(e.key)) {
        e.preventDefault();
        if (editNibble === -1) {
          // Start editing: high nibble
          editNibble = hexDigit;
        } else {
          // Low nibble: commit byte
          const newVal = (editNibble << 4) | hexDigit;
          mods.set(selEnd, newVal);
          statusMod.classList.remove('hidden');
          scheduleRecomputeRegex();
          editNibble = -1;
          // Advance to next byte
          selectByte(selEnd + 1);
          scrollToOffset(selEnd);
        }
        refreshRows();
        updateStatus();
        return;
      }
    } else {
      // ASCII text input (overwrite single char)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        mods.set(selEnd, e.key.charCodeAt(0));
        statusMod.classList.remove('hidden');
        scheduleRecomputeRegex();
        // Advance to next byte
        selectByte(selEnd + 1);
        scrollToOffset(selEnd);
        refreshRows();
        updateStatus();
        return;
      }
    }

    // Escape
    if (e.key === 'Escape') {
      editNibble = -1;
      selStart = -1;
      selEnd = -1;
      refreshRows();
      updateStatus();
    }
  });

  // ── Status bar ─────────────────────────────────
  function updateStatus() {
    if (!dataView || selStart < 0) {
      statusPos.textContent = 'Offset: —';
      statusVal.textContent = 'Value: —';
      return;
    }
    const lo = Math.min(selStart, selEnd);
    const hi = Math.max(selStart, selEnd);
    const count = hi - lo + 1;
    const curOff = selEnd;
    const val = getByteAt(curOff);

    if (count > 1) {
      statusPos.textContent = `Offset: 0x${formatOffset(lo)}–0x${formatOffset(hi)}  (${count} bytes)`;
    } else {
      statusPos.textContent = `Offset: 0x${formatOffset(curOff)} (${curOff})`;
    }

    let valText = `Dec: ${val}  Hex: 0x${hexByte(val)}  Bin: ${val.toString(2).padStart(8, '0')}`;
    if (editNibble >= 0) {
      valText += `  [editing: ${editNibble.toString(16).toUpperCase()}_]`;
    }
    statusVal.textContent = valText;
  }

  // ── Search ─────────────────────────────────────
  function doSearch() {
    const query = searchInput.value.trim();
    if (!query || !dataView) { clearSearch(); return; }

    matchOffsets = [];
    matchLengths = [];
    matchSetHex = new Set();
    activeMatchIdx = -1;

    const mode = searchMode.value;
    let needle;

    if (mode === 'hex') {
      // Parse hex string: strip spaces, must be even length hex chars
      const clean = query.replace(/\s+/g, '');
      if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
        searchRes.textContent = 'Invalid hex';
        btnPrev.disabled = true;
        btnNext.disabled = true;
        return;
      }
      needle = new Uint8Array(clean.length / 2);
      for (let i = 0; i < needle.length; i++) {
        needle[i] = parseInt(clean.substr(i * 2, 2), 16);
      }
    } else {
      // ASCII
      needle = new TextEncoder().encode(query);
    }

    if (needle.length === 0) { clearSearch(); return; }

    // Naive search
    const len = dataView.length;
    const nLen = needle.length;
    for (let i = 0; i <= len - nLen; i++) {
      let found = true;
      for (let j = 0; j < nLen; j++) {
        if (getByteAt(i + j) !== needle[j]) { found = false; break; }
      }
      if (found) {
        matchOffsets.push(i);
        matchLengths.push(nLen);
        for (let j = 0; j < nLen; j++) matchSetHex.add(i + j);
      }
    }

    if (matchOffsets.length > 0) {
      activeMatchIdx = 0;
      searchRes.textContent = `1 / ${matchOffsets.length}`;
      btnPrev.disabled = false;
      btnNext.disabled = false;
      scrollToOffset(matchOffsets[0]);
    } else {
      searchRes.textContent = '0 results';
      btnPrev.disabled = true;
      btnNext.disabled = true;
    }

    refreshRows();
  }

  function clearSearch() {
    matchOffsets = [];
    matchLengths = [];
    matchSetHex = new Set();
    activeMatchIdx = -1;
    searchRes.textContent = '';
    btnPrev.disabled = true;
    btnNext.disabled = true;
  }

  function navigateMatch(dir) {
    if (matchOffsets.length === 0) return;
    activeMatchIdx = (activeMatchIdx + dir + matchOffsets.length) % matchOffsets.length;
    searchRes.textContent = `${activeMatchIdx + 1} / ${matchOffsets.length}`;

    const off = matchOffsets[activeMatchIdx];
    const row = Math.floor(off / BYTES_PER_ROW);
    const top = row * ROW_HEIGHT;

    // Use a sentinel element so the browser's own scrollIntoView handles all the
    // scroll math — avoids clientHeight/scrollTop calculation pitfalls entirely.
    const sentinel = document.createElement('div');
    sentinel.style.cssText =
      `position:absolute;top:${top}px;left:0;height:${ROW_HEIGHT}px;width:1px;pointer-events:none;visibility:hidden;`;
    hexRows.appendChild(sentinel);
    sentinel.scrollIntoView({ block: 'center', inline: 'nearest' });
    hexRows.removeChild(sentinel);

    // Force full re-render at the new scroll position
    firstVisRow = -1;
    lastVisRow = -1;
    renderVisibleRows();
  }

  searchInput.addEventListener('input', debounce(doSearch, 250));
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) navigateMatch(-1);
      else navigateMatch(1);
    }
    if (e.key === 'Escape') {
      searchInput.blur();
      searchInput.value = '';
      clearSearch();
    }
  });
  searchMode.addEventListener('change', doSearch);
  btnPrev.addEventListener('mousedown', (e) => { e.preventDefault(); navigateMatch(-1); });
  btnNext.addEventListener('mousedown', (e) => { e.preventDefault(); navigateMatch(1); });

  // ── Go-to-offset ───────────────────────────────
  gotoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let val = gotoInput.value.trim();
      let off;
      if (val.startsWith('0x') || val.startsWith('0X')) {
        off = parseInt(val, 16);
      } else {
        const base = gotoMode.value === 'dec' ? 10 : 16;
        off = parseInt(val, base);
      }
      if (!isNaN(off) && dataView && off >= 0 && off < dataView.length) {
        selectByte(off);
        scrollToOffset(off);
        gotoInput.blur();
      }
    }
    if (e.key === 'Escape') {
      gotoInput.blur();
      gotoInput.value = '';
    }
  });

  // ── Scroll helpers ─────────────────────────────
  function scrollToOffset(off) {
    if (off < 0 || !dataView) return;
    const row = Math.floor(off / BYTES_PER_ROW);
    const top = row * ROW_HEIGHT;
    const viewH = hexScroll.clientHeight;
    const scrollTop = hexScroll.scrollTop;

    // Is it fully visible?
    const isVisible = (top >= scrollTop) && ((top + ROW_HEIGHT) <= (scrollTop + viewH));

    if (!isVisible) {
      const targetScroll = Math.max(0, top - Math.floor(viewH / 2) + Math.floor(ROW_HEIGHT / 2));
      hexScroll.scrollTop = targetScroll;
      renderVisibleRows();
    }
  }

  hexScroll.addEventListener('scroll', () => {
    requestAnimationFrame(renderVisibleRows);
  });

  // ── Resize observer ────────────────────────────
  const resizeObs = new ResizeObserver(() => {
    requestAnimationFrame(renderVisibleRows);
  });
  resizeObs.observe(hexScroll);

  // ── Debounce ───────────────────────────────────
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Wire buttons ───────────────────────────────
  btnOpen.addEventListener('click', openFilePicker);
  btnWelcome.addEventListener('click', openFilePicker);
  btnSave.addEventListener('click', saveFile);

  // ── Drag & drop ────────────────────────────────
  document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      loadBuffer(new Uint8Array(reader.result), file.name);
    };
    reader.readAsArrayBuffer(file);
  });

  // ── Code Runner Panel ──────────────────────────
  const codeRunnerPanel = document.getElementById('code-runner-panel');
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

    try {
      // Execute via new Function to keep strict scope
      // We pass `GROUPS`, `print`, `getString`, and `CONTENT` to the generated function body
      const fn = new Function('GROUPS', 'print', 'getString', 'CONTENT', code);
      fn(groupsPayload, print, getString, CONTENT);

      // In case CONTENT was modified, update UI
      if (mods.size > 0) {
        statusMod.classList.remove('hidden');
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

})();
