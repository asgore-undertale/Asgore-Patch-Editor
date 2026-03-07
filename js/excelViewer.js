const excelTableContainer = document.getElementById('excel-table-container');
const excelSheetSelect = document.getElementById('excel-sheet-select');
const btnExcelOpen = document.getElementById('btn-excel-open');
const excelFileInput = document.getElementById('excel-file-input');

let currentExcelWorkbook = null;
let currentSheetName = null;
let currentFileName = "";

/**
 * Loads and displays an Excel file in the viewer.
 */
async function loadExcelToViewer(file) {
    if (typeof XLSX === 'undefined') {
        console.error("SheetJS not loaded.");
        return;
    }

    try {
        const data = await file.arrayBuffer();
        currentExcelWorkbook = XLSX.read(data);
        currentFileName = file.name;

        // Show the panel (using the global excelViewerPanel)
        excelViewerPanel.classList.remove('hidden');
        excelViewerPanel.style.display = 'flex'; // Ensure it's not hidden by other means

        renderSheetOptions();

        // Render the first sheet by default
        if (currentExcelWorkbook.SheetNames.length > 0) {
            currentSheetName = currentExcelWorkbook.SheetNames[0];
            excelSheetSelect.value = currentSheetName;
            renderSheet(currentSheetName);
        }

    } catch (err) {
        console.error("Error reading Excel for viewer:", err);
        excelTableContainer.innerHTML = `<div class="excel-placeholder"><p style="color:#ff6b6b">Error loading file: ${err.message}</p></div>`;
    }
}

/**
 * Populates the selectbox with all sheets in the workbook.
 */
function renderSheetOptions() {
    excelSheetSelect.innerHTML = '';
    if (!currentExcelWorkbook) return;

    currentExcelWorkbook.SheetNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        excelSheetSelect.appendChild(option);
    });
}

/**
 * Renders a specific sheet into the table container.
 */
function renderSheet(sheetName) {
    const worksheet = currentExcelWorkbook.Sheets[sheetName];
    if (!worksheet) return;

    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) {
        excelTableContainer.innerHTML = '<div class="excel-placeholder"><p>The selected sheet is empty.</p></div>';
        return;
    }

    const table = document.createElement('table');
    table.className = 'excel-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = jsonData[0];
    headers.forEach(h => {
        const th = document.createElement('th');
        th.textContent = h || '';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let i = 1; i < jsonData.length; i++) {
        const tr = document.createElement('tr');
        const row = jsonData[i] || [];
        for (let j = 0; j < headers.length; j++) {
            const td = document.createElement('td');
            td.textContent = row[j] !== undefined ? row[j] : '';
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    excelTableContainer.innerHTML = '';
    excelTableContainer.appendChild(table);
}

if (excelSheetSelect) {
    excelSheetSelect.addEventListener('change', (e) => {
        currentSheetName = e.target.value;
        renderSheet(currentSheetName);
    });
}

if (btnExcelOpen && excelFileInput) {
    btnExcelOpen.addEventListener('click', () => excelFileInput.click());
    excelFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            loadExcelToViewer(file);
            excelFileInput.value = ''; // Reset
        }
    });
}
