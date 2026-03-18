
// ── Virtualised rendering ──────────────────────
function renderVisibleRows() {
  if (!dataView) return;
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
  if (!dataView) return 0;
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

  // ASCII / Decoded Content chars — decode using file encoding
  const ascDiv = el.children[2];
  const ascSpans = ascDiv.querySelectorAll('.ascii-char');

  // Get active file's encoding
  const activeFile = files.find(f => f.id === activeFileId);
  const fileEncoding = (activeFile && activeFile.encoding) || 'latin1';

  // Collect bytes for this row
  const rowBytes = new Uint8Array(BYTES_PER_ROW);
  let rowByteCount = 0;
  for (let i = 0; i < BYTES_PER_ROW; i++) {
    const off = baseOff + i;
    if (off < maxOff) {
      rowBytes[i] = getByteAt(off);
      rowByteCount++;
    }
  }

  // Build a per-byte-position map for decoded characters
  // charMap[i] = { char, isLead, charLen } where isLead marks the first byte of a character
  const charMap = new Array(BYTES_PER_ROW).fill(null);

  if (fileEncoding !== 'latin1' && fileEncoding !== 'iso-8859-1' && fileEncoding !== 'windows-1252' && rowByteCount > 0) {
    // Universal byte-by-byte boundary discovery for variable width encodings
    let i = 0;
    while (i < rowByteCount) {
      let charLen = 1;
      let display = '.';
      let valid = false;
      
      const decoder = new TextDecoder(fileEncoding, { fatal: true });
      for (let len = 1; len <= 4 && i + len <= rowByteCount; len++) {
        try {
          const ch = decoder.decode(rowBytes.subarray(i, i + len));
          // If it decodes successfully without throwing, we found the char boundary
          const code = ch.codePointAt(0);
          display = (code >= 0x20 && code !== 0xFFFD) ? ch : '.';
          charLen = len;
          valid = true;
          break;
        } catch (e) {
          // Incomplete sequence or invalid bytes
        }
      }

      if (valid && charLen > 1) {
        charMap[i] = { char: display, isLead: true, charLen };
        for (let k = 1; k < charLen; k++) {
          charMap[i + k] = { char: '', isLead: false, charLen };
        }
      } else if (valid && charLen === 1) {
        // Valid 1-byte char
        const b = rowBytes[i];
        display = isPrintable(b) ? String.fromCharCode(b) : '.';
        charMap[i] = { char: display, isLead: true, charLen: 1 };
      } else {
        // Invalid sequence — fallback to 1 byte dot
        charMap[i] = { char: '.', isLead: true, charLen: 1 };
        charLen = 1; // ensure we increment only by 1
      }
      i += charLen;
    }
  }

  for (let i = 0; i < BYTES_PER_ROW; i++) {
    const off = baseOff + i;
    const span = ascSpans[i];
    if (off < maxOff) {
      const val = getByteAt(off);
      const cm = charMap[i];

      // Reset inline styles from previous render
      span.style.flex = '';
      span.style.textAlign = '';
      span.style.overflow = '';
      span.style.width = '';
      span.style.padding = '';
      span.style.visibility = '';

      if (cm) {
        span.textContent = cm.char;
        span.dataset.off = off;
        span.dataset.charlen = cm.charLen;

        if (cm.isLead && cm.charLen > 1) {
          // Widen the lead span to cover all its bytes
          span.style.flex = `0 0 ${cm.charLen * 8.4}px`;
          span.style.textAlign = 'left';
          span.style.paddingLeft = '2px';
        } else if (!cm.isLead) {
          // Hide continuation span (lead span already covers it)
          span.style.flex = '0 0 0px';
          span.style.overflow = 'hidden';
          span.style.width = '0';
          span.style.padding = '0';
        }

        let cls = 'ascii-char';
        if (cm.isLead && cm.char !== '.' && cm.char !== '') cls += ' printable';
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
        const gc2 = byteGroupColor.get(off);
        span.style.backgroundColor = gc2 ? gc2 + '55' : '';
        span.style.borderRadius = gc2 ? '2px' : '';
      } else {
        // Latin-1 fallback: byte-by-byte (also default when no charMap entry)
        const displayChar = isPrintable(val) ? String.fromCharCode(val) : '.';
        span.textContent = displayChar;
        span.dataset.off = off;

        let cls = 'ascii-char';
        if (isPrintable(val)) cls += ' printable';
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
        const gc2 = byteGroupColor.get(off);
        span.style.backgroundColor = gc2 ? gc2 + '55' : '';
        span.style.borderRadius = gc2 ? '2px' : '';
      }
    } else {
      span.textContent = '';
      span.dataset.off = '';
      span.className = 'ascii-char';
      span.style.visibility = 'hidden';
      span.style.flex = '';
      span.style.overflow = '';
      span.style.width = '';
      span.style.padding = '';
    }
  }
}

function getSelectionBounds() {
  if (selStart < 0 || selEnd < 0) return { lo: -1, hi: -1 };
  if (activePane === 'ascii') {
    if (selStart <= selEnd) {
      return { lo: selStart, hi: selEnd + selEndLen - 1 };
    } else {
      return { lo: selEnd, hi: selStart + selAnchorLen - 1 };
    }
  } else {
    return { lo: Math.min(selStart, selEnd), hi: Math.max(selStart, selEnd) };
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
  const bounds = getSelectionBounds();
  return off >= bounds.lo && off <= bounds.hi;
}

// Force re-render all visible rows
function refreshRows() {
  if (!dataView) return;
  firstVisRow = -1;
  lastVisRow = -1;
  renderVisibleRows();
}

// ── Selection (mousedown / mousemove / mouseup) ──
function getOffsetFromEvent(e) {
  const t = e.target;
  if (t.dataset.off === undefined && t.dataset.off !== '0') return null;
  const off = parseInt(t.dataset.off, 10);
  const charLen = parseInt(t.dataset.charlen || '1', 10);
  return isNaN(off) ? null : { off, charLen };
}

hexRows.addEventListener('mousedown', (e) => {
  const loc = getOffsetFromEvent(e);
  if (!loc || !dataView) return;
  e.preventDefault();

  if (e.target.classList.contains('ascii-char')) {
    activePane = 'ascii';
  } else if (e.target.classList.contains('hex-byte')) {
    activePane = 'hex';
  }

  if (e.shiftKey && selStart >= 0) {
    // Extend selection from anchor
    selEnd = loc.off;
    selEndLen = loc.charLen;
  } else {
    selStart = loc.off;
    selAnchor = loc.off;
    selAnchorLen = loc.charLen;
    selEnd = loc.off;
    selEndLen = loc.charLen;
  }
  isDragging = true;
  editNibble = -1;
  updateStatus();
  refreshRows();
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const loc = getOffsetFromEvent(e);
  if (!loc) return;
  selEnd = loc.off;
  selEndLen = loc.charLen;
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
  selAnchorLen = 1;
  selEndLen = 1;
  activePane = pane;
  editNibble = -1;
  updateStatus();
  refreshRows();
}

// ── Editing ────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Keyboard shortcuts
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
    const bounds = getSelectionBounds();
    const lo = bounds.lo;
    const hi = bounds.hi;

    if (activePane === 'hex') {
      const hexParts = [];
      for (let i = lo; i <= hi; i++) {
        hexParts.push(hexByte(getByteAt(i)));
      }
      navigator.clipboard.writeText(hexParts.join(' ')).catch(() => { });
    } else {
      // Copy decoded text using the file's encoding
      const activeFile = files.find(f => f.id === activeFileId);
      const enc = (activeFile && activeFile.encoding) || 'latin1';
      const bytes = new Uint8Array(hi - lo + 1);
      for (let i = lo; i <= hi; i++) {
        bytes[i - lo] = getByteAt(i);
      }
      let text;
      try {
        text = new TextDecoder(enc).decode(bytes);
      } catch (e) {
        text = new TextDecoder('latin1').decode(bytes);
      }
      navigator.clipboard.writeText(text).catch(() => { });
    }
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

document.addEventListener('paste', (e) => {
  if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;
  if (!dataView || selStart < 0) return;

  const text = e.clipboardData.getData('text');
  if (!text) return;

  e.preventDefault();
  const bounds = getSelectionBounds();
  const lo = bounds.lo;
  const hi = bounds.hi;
  const removeLen = hi - lo + 1;
  let newBytes;

  if (activePane === 'hex') {
    let clean = text.replace(/[^0-9a-fA-F]/g, '');
    if (clean.length === 0) return;
    if (clean.length % 2 !== 0) clean += '0'; // Pad trailing nibble instead of dropping
    newBytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < newBytes.length; i++) {
      newBytes[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
  } else {
    const activeFile = files.find(f => f.id === activeFileId);
    const enc = (activeFile && activeFile.encoding) || 'latin1';
    
    if (enc === 'latin1' || enc === 'iso-8859-1' || enc === 'windows-1252') {
      newBytes = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) newBytes[i] = text.charCodeAt(i) & 0xFF;
    } else if (enc === 'utf-16le' || enc === 'utf-16be') {
      const isLE = enc === 'utf-16le';
      newBytes = new Uint8Array(text.length * 2);
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (isLE) {
          newBytes[i * 2] = code & 0xFF;
          newBytes[i * 2 + 1] = code >> 8;
        } else {
          newBytes[i * 2] = code >> 8;
          newBytes[i * 2 + 1] = code & 0xFF;
        }
      }
    } else {
      newBytes = new TextEncoder().encode(text); // UTF-8 and fallback
    }
  }

  patchFile(activeFileId, lo, removeLen, newBytes);

  // Update selection to cover the new pasted range
  selStart = lo;
  selEnd = lo + newBytes.length - 1;
  selAnchor = lo;
  selAnchorLen = 1;
  selEndLen = 1;
  if (selEnd < selStart) selEnd = selStart; // Safety for 0-byte pastes

  refreshRows();
  updateStatus();
});

// ── Status bar ─────────────────────────────────
function updateStatus() {
  if (!dataView || selStart < 0) {
    statusPos.textContent = 'Offset: —';
    statusVal.textContent = 'Value: —';
    return;
  }
  const bounds = getSelectionBounds();
  const lo = bounds.lo;
  const hi = bounds.hi;
  const count = hi - lo + 1;
  const curOff = selEnd;
  const val = getByteAt(curOff);

  if (count > 1) {
    statusPos.textContent = `Offset: 0x${formatOffset(lo)}–0x${formatOffset(hi)}  (${count} bytes)`;
  } else {
    statusPos.textContent = `Offset: 0x${formatOffset(curOff)} (Dec: ${curOff})`; // Added dec offset here for convenience
  }

  let valText = `Dec: ${val}  Hex: 0x${hexByte(val)}  Bin: ${val.toString(2).padStart(8, '0')}`;
  if (editNibble >= 0) {
    valText += `  [editing: ${editNibble.toString(16).toUpperCase()}_]`;
  }
  statusVal.textContent = valText;
}

