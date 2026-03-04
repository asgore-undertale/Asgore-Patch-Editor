
// ── Wire welcome buttons ───────────────────────
const btnWelcomeFolder = document.getElementById('btn-welcome-folder');
btnWelcome.addEventListener('click', () => filePicker.click());
btnWelcomeFolder.addEventListener('click', () => folderPicker.click());

// ── Keyboard shortcuts ─────────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    filePicker.click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveFile();
  }
});

// ── Drag & drop ────────────────────────────────
document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
document.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  const items = e.dataTransfer.items;
  if (items && items.length > 0) {
    // Check if it's a folder drop (via webkitGetAsEntry)
    const entries = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) entries.push(entry);
    }
    if (entries.length > 0 && entries.some(en => en.isDirectory)) {
      // Read folder entries recursively
      readEntriesRecursive(entries).then(fileList => {
        for (const { file, path } of fileList) {
          const reader = new FileReader();
          reader.onload = () => {
            const id = addFile(new Uint8Array(reader.result), file.name, path);
            if (files.length === 1) switchToFile(id);
          };
          reader.readAsArrayBuffer(file);
        }
      });
      return;
    }
  }
  // Fallback: treat as individual files
  const droppedFiles = e.dataTransfer.files;
  for (const file of droppedFiles) {
    const reader = new FileReader();
    reader.onload = () => {
      const id = addFile(new Uint8Array(reader.result), file.name, file.name);
      if (files.length === 1) switchToFile(id);
    };
    reader.readAsArrayBuffer(file);
  }
});

// ── Recursive folder reader for drag-drop ──────
function readEntriesRecursive(entries) {
  const results = [];
  function readEntry(entry, basePath) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file(file => {
          results.push({ file, path: basePath + '/' + file.name });
          resolve();
        });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        reader.readEntries(children => {
          Promise.all(children.map(ch => readEntry(ch, basePath + '/' + entry.name))).then(resolve);
        });
      } else {
        resolve();
      }
    });
  }
  return Promise.all(entries.map(en => readEntry(en, ''))).then(() => results);
}
