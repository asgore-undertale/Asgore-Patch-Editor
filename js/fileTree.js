
// ── File Tree ──────────────────────────────────
const fileTreeList = $('#file-tree-list');
const btnAddFile = $('#btn-open-file');
const btnAddFolder = $('#btn-open-folder');
const btnSaveFile = $('#btn-save-file');

// ── Add a single file to the store ─────────────
function addFile(buffer, name, path) {
    const filePath = path || name;

    // Check for duplicates
    const existing = files.find(f => f.path === filePath);
    if (existing) {
        existing.buffer = new Uint8Array(buffer);
        existing.dataView = new Uint8Array(buffer);
        // We keep existing.mods to preserve user edits, or we could clear them.
        // Usually reloading a file means starting fresh from disk, so let's clear mods.
        existing.mods.clear();

        // If this is the active file, update the active view
        if (activeFileId === existing.id) {
            fileBuffer = existing.buffer;
            dataView = existing.dataView;
            totalRows = Math.ceil(dataView.length / BYTES_PER_ROW);
            fileSizeEl.textContent = formatSize(dataView.length);
            statusMod.classList.add('hidden');
            refreshRows();
        }
        return existing.id;
    }

    const id = nextFileId++;
    const entry = {
        id,
        name,
        path: filePath,
        buffer: new Uint8Array(buffer),
        dataView: new Uint8Array(buffer),
        mods: new Map()
    };
    files.push(entry);
    renderFileTree();
    return id;
}

// ── Add multiple files from a folder input ─────
function addFolder(fileList) {
    const promises = [];
    for (const file of fileList) {
        promises.push(new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
                const path = file.webkitRelativePath || file.name;
                addFile(new Uint8Array(reader.result), file.name, path);
                resolve();
            };
            reader.readAsArrayBuffer(file);
        }));
    }
    Promise.all(promises).then(() => {
        // Auto-select first file if none active
        if (!activeFileId && files.length > 0) {
            switchToFile(files[0].id);
        }
    });
}

// ── Switch the hex editor to show a specific file
function switchToFile(id) {
    const entry = files.find(f => f.id === id);
    if (!entry) return;

    // Save current file state back
    if (activeFileId) {
        const prev = files.find(f => f.id === activeFileId);
        if (prev) {
            prev.mods = new Map(mods);
        }
    }

    activeFileId = id;
    fileBuffer = entry.buffer;
    dataView = entry.dataView;
    fileName = entry.name;
    mods = new Map(entry.mods);
    totalRows = Math.ceil(dataView.length / BYTES_PER_ROW);

    // Reset selection / search state
    selStart = -1;
    selEnd = -1;
    selAnchor = -1;
    isDragging = false;
    editNibble = -1;
    matchOffsets = [];
    matchLengths = [];
    matchSetHex = new Set();
    activeMatchIdx = -1;

    // UI updates
    fileNameEl.textContent = entry.path;
    fileSizeEl.textContent = formatSize(dataView.length);
    statusMod.classList.add('hidden');
    if (mods.size > 0) statusMod.classList.remove('hidden');
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

    // Rebuild groups for active file
    rebuildByteGroupColor();
    scheduleRecomputeRegex();
    renderGroupsPanel();

    // Highlight active in tree
    renderFileTree();
}

// ── Build the tree structure from paths ────────
function buildTree(filesList) {
    const root = { name: '', children: {}, files: [] };
    for (const f of filesList) {
        const parts = f.path.split('/');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!node.children[parts[i]]) {
                node.children[parts[i]] = { name: parts[i], children: {}, files: [] };
            }
            node = node.children[parts[i]];
        }
        node.files.push(f);
    }
    return root;
}

const closedFolders = new Set();

function renderFileTree() {
    fileTreeList.innerHTML = '';
    if (files.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'file-tree-empty';
        empty.innerHTML = '<p>No files loaded.</p><p>Click <strong>+ File</strong> or <strong>+ Folder</strong> to begin.</p>';
        fileTreeList.appendChild(empty);
        return;
    }

    const tree = buildTree(files);
    renderTreeNode(tree, fileTreeList, 0, '');
}

function renderTreeNode(node, container, depth, pathPrefix) {
    // Render folders
    const sortedDirs = Object.keys(node.children).sort();
    for (const dirName of sortedDirs) {
        const dir = node.children[dirName];
        const dirPath = pathPrefix ? pathPrefix + '/' + dirName : dirName;
        const isClosed = closedFolders.has(dirPath);

        const folderEl = document.createElement('div');
        folderEl.className = 'file-tree-folder';

        const headerEl = document.createElement('div');
        headerEl.className = 'file-tree-folder-head';
        headerEl.style.paddingLeft = (8 + depth * 14) + 'px';

        const arrow = document.createElement('span');
        arrow.className = isClosed ? 'file-tree-arrow' : 'file-tree-arrow open';
        arrow.textContent = isClosed ? '▸' : '▾';

        const icon = document.createElement('span');
        icon.className = 'file-tree-folder-icon';
        icon.textContent = '📁';

        const label = document.createElement('span');
        label.className = 'file-tree-label';
        label.textContent = dirName;

        const delBtn = document.createElement('span');
        delBtn.className = 'file-tree-delete';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Remove folder';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Remove folder '${dirName}'?`)) {
                // Remove all files starting with this folder path
                const prefix = dirPath + '/';
                const idsToRemove = files.filter(f => f.path.startsWith(prefix)).map(f => f.id);
                idsToRemove.forEach(removeFileById);
            }
        });

        headerEl.appendChild(arrow);
        headerEl.appendChild(icon);
        headerEl.appendChild(label);
        headerEl.appendChild(delBtn);

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'file-tree-children';
        childrenContainer.style.display = isClosed ? 'none' : '';

        headerEl.addEventListener('click', () => {
            const isOpen = arrow.classList.toggle('open');
            arrow.textContent = isOpen ? '▾' : '▸';
            childrenContainer.style.display = isOpen ? '' : 'none';
            if (isOpen) {
                closedFolders.delete(dirPath);
            } else {
                closedFolders.add(dirPath);
            }
        });

        folderEl.appendChild(headerEl);
        folderEl.appendChild(childrenContainer);
        container.appendChild(folderEl);

        renderTreeNode(dir, childrenContainer, depth + 1, dirPath);
    }

    // Render files at this level
    const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
    for (const f of sortedFiles) {
        const fileEl = document.createElement('div');
        fileEl.className = 'file-tree-item' + (f.id === activeFileId ? ' active' : '');
        fileEl.style.paddingLeft = (16 + depth * 14) + 'px'; // +16 for icon alignment without arrow

        const icon = document.createElement('span');
        icon.className = 'file-tree-file-icon';
        icon.textContent = '📄';

        const label = document.createElement('span');
        label.className = 'file-tree-label';
        label.textContent = f.name;

        const sizeEl = document.createElement('span');
        sizeEl.className = 'file-tree-size';
        sizeEl.textContent = formatSize(f.buffer.length);

        const delBtn = document.createElement('span');
        delBtn.className = 'file-tree-delete';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Remove file';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFileById(f.id);
        });

        fileEl.appendChild(icon);
        fileEl.appendChild(label);
        fileEl.appendChild(sizeEl);
        fileEl.appendChild(delBtn);

        fileEl.addEventListener('click', () => switchToFile(f.id));

        container.appendChild(fileEl);
    }
}

function removeFileById(id) {
    files = files.filter(f => f.id !== id);
    if (activeFileId === id) {
        if (files.length > 0) {
            switchToFile(files[0].id);
        } else {
            // Close completely
            activeFileId = null;
            dataView = null;
            fileBuffer = null;
            fileName = '';
            mods.clear();
            hexEditor.classList.add('hidden');
            welcomeScr.classList.remove('hidden');
        }
    } else {
        renderFileTree();
    }
}

// ── Wire tree buttons ──────────────────────────
btnAddFile.addEventListener('click', () => filePicker.click());
btnAddFolder.addEventListener('click', () => folderPicker.click());

filePicker.addEventListener('change', (e) => {
    const fileList = e.target.files;
    if (!fileList.length) return;
    for (const file of fileList) {
        const reader = new FileReader();
        reader.onload = () => {
            const id = addFile(new Uint8Array(reader.result), file.name, file.name);
            if (files.length === 1) switchToFile(id);
        };
        reader.readAsArrayBuffer(file);
    }
    filePicker.value = '';
});

folderPicker.addEventListener('change', (e) => {
    const fileList = e.target.files;
    if (!fileList.length) return;
    addFolder(fileList);
    folderPicker.value = '';
});

btnSaveFile.addEventListener('click', () => saveFile());
