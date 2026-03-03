
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

