
  // ── Constants ──────────────────────────────────
  const BYTES_PER_ROW = 16;
  const ROW_HEIGHT = 22;        // matches CSS --row-h
  const RENDER_PAD = 8;         // extra rows above/below viewport

  // ── DOM refs ───────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const filePicker = $('#file-picker');
  const btnOpen = $('#btn-open');
  const btnSave = $('#btn-save');
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

  // ── State ──────────────────────────────────────
  let fileBuffer = null;       // Uint8Array
  let dataView = null;       // working copy (editable)
  let fileName = '';
  let totalRows = 0;

  let selStart = -1;         // selection range start offset
  let selEnd = -1;         // selection range end offset (inclusive)
  let selAnchor = -1;         // anchor for drag selection
  let isDragging = false;
  let activePane = 'hex';      // 'hex' or 'ascii'
  let editNibble = -1;         // 0 = high nibble typed, 1 = waiting for low

  // Modifications map: offset → new byte value
  const mods = new Map();

  // ── Global references to access later ──────────
  let codeInput; // assigned later in the file

  // Search state
  let matchOffsets = [];         // array of match start offsets
  let matchLengths = [];         // length of each match
  let matchSetHex = new Set();  // set of ALL individual byte offsets in matches
  let activeMatchIdx = -1;

  // Groups state: { id, name, color, ranges:[{start,end}] }[]
  let groups = [];
  let nextGroupId = 1;
  // Flat map: offset → group color (rebuilt on any group change)
  let byteGroupColor = new Map();

  // Virtualization bookkeeping
  let firstVisRow = 0;
  let lastVisRow = 0;
  let rowPool = [];          // recycled row elements

