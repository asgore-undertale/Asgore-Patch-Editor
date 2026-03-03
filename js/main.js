
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

