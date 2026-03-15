
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

