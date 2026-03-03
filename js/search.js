
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

