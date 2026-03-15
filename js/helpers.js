
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

/**
 * Patches a file with new bytes, potentially changing its size.
 * Shifts all subsequent modifications and group ranges.
 */
function patchFile(fileId, offset, removeLen, newBytes) {
  const targetFile = files.find(f => f.id === fileId);
  if (!targetFile) return;

  const diff = newBytes.length - removeLen;
  const oldLen = targetFile.dataView.length;
  const newLen = oldLen + diff;

  // 1. Create new buffer and splice
  const newBuffer = new Uint8Array(newLen);
  // Copy prefix
  newBuffer.set(targetFile.dataView.subarray(0, offset));
  // Insert new bytes
  newBuffer.set(newBytes, offset);
  // Copy suffix
  if (offset + removeLen < oldLen) {
    newBuffer.set(targetFile.dataView.subarray(offset + removeLen), offset + newBytes.length);
  }

  // Update the file's primary data representation
  targetFile.dataView = newBuffer;
  targetFile.buffer = newBuffer; // Keep original-buffer-copy in sync too

  // 2. Shift modifications in the mods Map
  const targetMods = (fileId === activeFileId) ? mods : targetFile.mods;
  const newMods = new Map();
  targetMods.forEach((val, off) => {
    if (off < offset) {
      newMods.set(off, val);
    } else if (off >= offset + removeLen) {
      newMods.set(off + diff, val);
    }
    // Mods inside the removed range are discarded as they are overwritten by newBytes
  });

  if (fileId === activeFileId) {
    mods = newMods;
  } else {
    targetFile.mods = newMods;
  }

  // 3. Shift group ranges in global groups
  groups.forEach(g => {
    g.ranges.forEach(r => {
      if (r.fileId === fileId) {
        // If the range starts after the patch point, shift it entirely
        if (r.start >= offset + removeLen) {
          r.start += diff;
          r.end += diff;
        }
        // If the patch point is inside or at the start of the range
        // We resize the range to match the new size if it was exactly covering the removeLen
        else if (r.start === offset && (r.end - r.start + 1) === removeLen) {
          r.end = r.start + newBytes.length - 1;
        }
        // Note: More complex intersection cases could be handled, but these cover the primary use cases.
      }
    });
  });

  // 4. Update global state if active
  if (fileId === activeFileId) {
    dataView = targetFile.dataView;
    fileBuffer = targetFile.buffer;
    if (dataView) {
      totalRows = Math.ceil(dataView.length / BYTES_PER_ROW);

      const fSizeEl = document.getElementById('file-size');
      if (fSizeEl) fSizeEl.textContent = formatSize(dataView.length);

      const hSpacer = document.getElementById('hex-spacer');
      if (hSpacer) hSpacer.style.height = (totalRows * ROW_HEIGHT) + 'px';

      if (mods.size > 0) statusMod.classList.remove('hidden');
      else statusMod.classList.add('hidden');

      if (typeof scheduleRecomputeRegex === 'function') scheduleRecomputeRegex();
      if (typeof rebuildByteGroupColor === 'function') rebuildByteGroupColor();
    }
  }
}

