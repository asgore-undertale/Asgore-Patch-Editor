
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

