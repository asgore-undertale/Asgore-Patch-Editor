
// ── Constants ──────────────────────────────────
const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 22;        // matches CSS --row-h
const RENDER_PAD = 8;         // extra rows above/below viewport

// ── DOM refs ───────────────────────────────────
const $ = (s) => document.querySelector(s);
const filePicker = $('#file-picker');
const folderPicker = $('#folder-picker');
const btnOpenProj = $('#btn-open-proj');
const btnSaveProj = $('#btn-save-proj');
const projPicker = $('#proj-picker');
const btnWelcome = $('#btn-welcome-open');
const welcomeScr = $('#welcome-screen');
const hexEditor = $('#hex-editor');
const hexScroll = $('#hex-scroll');
const hexSpacer = $('#hex-spacer');
const hexRows = $('#hex-rows');
const fileNameEl = $('#file-name');
const fileSizeEl = $('#file-size');
const searchInput = $('#search-input');
const searchMode = $('#search-mode');
const btnPrev = $('#btn-search-prev');
const btnNext = $('#btn-search-next');
const searchRes = $('#search-results');
const gotoInput = $('#goto-input');
const gotoMode = $('#goto-mode');
const statusPos = $('#status-position');
const statusVal = $('#status-value');
const statusMod = $('#status-modified');

const fileTreePanel = $('#file-tree-panel');
const excelViewerPanel = $('#excel-viewer-panel');
const codeRunnerPanel = $('#code-runner-panel');
const groupsPanel = $('#groups-panel');

// ── Multi-File Store ──────────────────────────
// Each entry: { id, name, path, buffer, dataView, mods: Map }
let files = [];
let nextFileId = 1;
let activeFileId = null;

// ── Active-file aliases (set by switchToFile) ─
let fileBuffer = null;       // Uint8Array (original)
let dataView = null;         // working copy (editable)
let fileName = '';
let totalRows = 0;

let selStart = -1;
let selEnd = -1;
let selAnchor = -1;
let isDragging = false;
let activePane = 'hex';
let editNibble = -1;

// Active file's modifications map: offset → new byte value
let mods = new Map();

// ── Global references to access later ──────────
let codeInput; // assigned later in the file

// Search state
let matchOffsets = [];
let matchLengths = [];
let matchSetHex = new Set();
let activeMatchIdx = -1;

// Groups state: { id, name, color, ranges:[{fileId, start, end}], regexes, regexRanges }[]
let groups = [];
let nextGroupId = 1;
// Flat map: offset → group color (rebuilt on any group change, for activeFileId only)
let byteGroupColor = new Map();

// Virtualization bookkeeping
let firstVisRow = 0;
let lastVisRow = 0;
let rowPool = [];
