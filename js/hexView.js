
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

