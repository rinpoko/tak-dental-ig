/* ── Font helper ── */
function fontFamilyCSS(name) {
  if (!name || !name.trim()) return '"Hiragino Sans", sans-serif';
  const n = name.trim();
  return n.includes(' ') ? `"${n}", sans-serif` : `${n}, sans-serif`;
}

/* ── Photo filter CSS strings ── */
const PHOTO_FILTERS = {
  normal: 'none',
  warm:   'sepia(15%) saturate(140%) brightness(107%) hue-rotate(-8deg)',
  cool:   'saturate(80%) brightness(96%) hue-rotate(18deg) contrast(107%)',
  soft:   'saturate(65%) contrast(90%) brightness(112%)',
};

/* ── Build CSS filter for frame overlay (per-photo hue/sat) ── */
function buildFrameFilter() {
  return buildFrameFilterFor(state.photos[state.previewPhotoIdx]);
}
function buildFrameFilterFor(photo) {
  if (!photo) return 'none';
  const parts = [];
  if ((photo.frameHue || 0) !== 0) parts.push(`hue-rotate(${photo.frameHue}deg)`);
  if ((photo.frameSat ?? 100) !== 100) parts.push(`saturate(${photo.frameSat}%)`);
  return parts.length ? parts.join(' ') : 'none';
}

/* ── Build CSS filter string for a specific photo ── */
function buildFilterStringFor(photo) {
  const base = PHOTO_FILTERS[photo.filter] || 'none';
  const b = photo.brightness;
  const c = photo.contrast;
  if (b === 100 && c === 100) return base;
  const adj = `brightness(${b}%) contrast(${c}%)`;
  return base === 'none' ? adj : `${base} ${adj}`;
}

/* ── State ── */
const state = {
  // each photo: { file, url, filter, brightness, contrast, frameId, offset, scale, rotation, frameHue, frameSat, textStyle, icons }
  photos: [],
  availableFrames: [],
  availableIcons: [],
  generatedCopy: null,
  generatedImages: [],
  textStyle: null,      // alias → state.photos[previewPhotoIdx].textStyle
  previewPhotoIdx: 0,
  selectedIconId: null, // currently-selected placed icon on the active photo
  selectedTextId: null, // currently-selected custom text box on the active photo
  kernCursor: null,     // charIdx gap position for Option+click kerning, or null
  kernTargetId: null,   // which text the kern cursor belongs to (null = headline)
  _hlLayout: [],        // cached char positions from last drawEditPreview
  _textLayouts: {},     // custom text id → { layout, fontSizePx } from last redraw
  emojiMode: 'with',
  systemFonts: [],
  selectedFonts: [],
  customFonts: [],  // user-uploaded font files: { id, name, filename, url }
  hashtags: '',
  accountName: 'たかはし歯科', // poster name shown in the exported Instagram-preview mockup
  currentProjectPath: null, // path of the currently-open .tak file (null = unsaved)
};

/* base width (in 1080-space) of a placed icon at scale 1.0 */
const ICON_BASE_W = 300;

/* ── Image cache (avoid reloading same URL) ── */
const imgCache = new Map();
function cachedImg(url) {
  if (imgCache.has(url)) return Promise.resolve(imgCache.get(url));
  return loadImg(url).then(img => { imgCache.set(url, img); return img; });
}

/* ── DOM refs ── */
const dropZone      = document.getElementById('dropZone');
const photoInput    = document.getElementById('photoInput');
const photoThumbs   = document.getElementById('photoThumbs');
const filterBar     = document.getElementById('filterBar');
const descriptionEl = document.getElementById('description');
const frameGrid     = document.getElementById('frameGrid');
const btnGenerate   = document.getElementById('btnGenerate');
const outputEmpty   = document.getElementById('outputEmpty');
const outputLoading = document.getElementById('outputLoading');
const outputEditing = document.getElementById('outputEditing');
const outputResults = document.getElementById('outputResults');
const loadingMsg    = document.getElementById('loadingMsg');
const toast         = document.getElementById('toast');

// Frame add modal
const frameModal         = document.getElementById('frameModal');
const btnAddFrame        = document.getElementById('btnAddFrame');
const modalClose         = document.getElementById('modalClose');
const btnModalCancel     = document.getElementById('btnModalCancel');
const btnModalSave       = document.getElementById('btnModalSave');
const modalUploadZone    = document.getElementById('modalUploadZone');
const framePreviewCanvas = document.getElementById('framePreviewCanvas');
const previewHint        = document.getElementById('previewHint');

// Settings modal
const aiStatus           = document.getElementById('aiStatus');
const btnSettings        = document.getElementById('btnSettings');
const settingsModal      = document.getElementById('settingsModal');
const settingsModalClose = document.getElementById('settingsModalClose');
const btnSettingsCancel  = document.getElementById('btnSettingsCancel');
const btnSettingsSave    = document.getElementById('btnSettingsSave');
const modelSelect        = document.getElementById('modelSelect');
const btnRefreshModels   = document.getElementById('btnRefreshModels');
const ollamaStatusDot    = document.getElementById('ollamaStatusDot');
const ollamaStatusText   = document.getElementById('ollamaStatusText');
const btnOpenOutput      = document.getElementById('btnOpenOutput');
const geminiApiKeyInput  = document.getElementById('geminiApiKeyInput');
const geminiModelSelect  = document.getElementById('geminiModelSelect');
const btnRefreshGeminiModels = document.getElementById('btnRefreshGeminiModels');
const geminiStatusDot    = document.getElementById('geminiStatusDot');
const geminiStatusText   = document.getElementById('geminiStatusText');

// Project save/open (Electron native)
const btnOpenProject     = document.getElementById('btnOpenProject');
const btnSaveProject     = document.getElementById('btnSaveProject');

// Editing phase
const editHeadline      = document.getElementById('editHeadline');
const editSubtitle      = document.getElementById('editSubtitle');
const editPreviewCanvas = document.getElementById('editPreviewCanvas');
const previewFrameLabel = document.getElementById('previewFrameLabel');
const btnPrevFrame      = document.getElementById('btnPrevFrame');
const btnNextFrame      = document.getElementById('btnNextFrame');
const captionBody       = document.getElementById('captionBody');
const captionTabs       = document.getElementById('captionTabs');
const btnCopy           = document.getElementById('btnCopy');
const btnRegenerate     = document.getElementById('btnRegenerate');
const btnComposite      = document.getElementById('btnComposite');

// Icon (sticker) controls
const iconPicker        = document.getElementById('iconPicker');
const iconFileInput     = document.getElementById('iconFileInput');
const iconPlacedWrap    = document.getElementById('iconPlacedWrap');
const iconPlacedList    = document.getElementById('iconPlacedList');
const iconSettings      = document.getElementById('iconSettings');
const btnIconDelete     = document.getElementById('btnIconDelete');

// Results phase
const resultImages = document.getElementById('resultImages');
const btnReEdit    = document.getElementById('btnReEdit');
const btnDownload  = document.getElementById('btnDownload');

/* ── Toast ── */
function showToast(msg, duration = 2400) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

/* ── Output state switcher ── */
function setOutput(mode) {
  outputEmpty.hidden   = mode !== 'empty';
  outputLoading.hidden = mode !== 'loading';
  outputEditing.hidden = mode !== 'editing';
  outputResults.hidden = mode !== 'results';
  document.getElementById('colRight').hidden = mode !== 'editing';
}

/* ════════════════════════════════════════
   Photo upload
   ════════════════════════════════════════ */
dropZone.addEventListener('click', () => photoInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles([...e.dataTransfer.files].filter(f => f.type.startsWith('image/')));
});
photoInput.addEventListener('change', () => handleFiles([...photoInput.files]));

function handleFiles(files) {
  files.forEach(file => state.photos.push({
    file, url: URL.createObjectURL(file),
    filter: 'normal', brightness: 100, contrast: 100,
    frameId: null, offset: { x: 0, y: 0 }, scale: 1.0, rotation: 0,
    bgColor: '#ffffff',
    frameHue: 0, frameSat: 100,
    textStyle: null,
    icons: [],
    texts: [],
  }));
  if (state.photos.length === files.length) {
    // First batch: activate the first photo
    state.previewPhotoIdx = 0;
  }
  renderThumbs();
  updateGenerateBtn();
}

/* Drag-and-drop thumbnail reordering — dragSrcIndex tracks the thumb currently
   being dragged; the drop target reads it to know which photo to move. */
let dragSrcIndex = null;

function renderThumbs() {
  photoThumbs.innerHTML = '';
  state.photos.forEach((p, i) => {
    const isActive = i === state.previewPhotoIdx;
    const assignedFrame = p.frameId ? state.availableFrames.find(f => f.id === p.frameId) : null;
    const div = document.createElement('div');
    div.className = 'photo-thumb' + (isActive ? ' active' : '');
    div.draggable = true;
    div.innerHTML = `
      <img src="${p.url}" alt="" style="filter:${buildFilterStringFor(p)}">
      <span class="thumb-badge">${i + 1}</span>
      ${assignedFrame ? `<span class="thumb-frame-badge">${escHtml(assignedFrame.name.slice(0, 8))}</span>` : ''}
      <button class="thumb-remove">×</button>
    `;
    div.addEventListener('click', e => {
      if (e.target.classList.contains('thumb-remove')) {
        URL.revokeObjectURL(p.url);
        imgCache.delete(p.url);
        state.photos.splice(i, 1);
        state.previewPhotoIdx = Math.min(state.previewPhotoIdx, Math.max(0, state.photos.length - 1));
        renderThumbs();
        renderFrameGrid(state.availableFrames);
        updateGenerateBtn();
        if (!state.photos.length) filterBar.hidden = true;
      } else {
        switchToPhoto(i);
      }
    });

    div.addEventListener('dragstart', e => {
      dragSrcIndex = i;
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
    });
    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      dragSrcIndex = null;
    });
    div.addEventListener('dragover', e => {
      if (dragSrcIndex === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (i !== dragSrcIndex) div.classList.add('drag-over-thumb');
    });
    div.addEventListener('dragleave', () => {
      div.classList.remove('drag-over-thumb');
    });
    div.addEventListener('drop', e => {
      e.preventDefault();
      div.classList.remove('drag-over-thumb');
      const from = dragSrcIndex;
      const to = i;
      dragSrcIndex = null;
      if (from === null || from === to) return;
      // Keep the active photo the SAME PHOTO after reordering, not the same index —
      // otherwise dragging photo 3 above the active photo 1 would silently switch
      // which photo is being edited.
      const activePhoto = state.photos[state.previewPhotoIdx];
      const [moved] = state.photos.splice(from, 1);
      state.photos.splice(to, 0, moved);
      state.previewPhotoIdx = state.photos.indexOf(activePhoto);
      renderThumbs();
      renderFrameGrid(state.availableFrames);
      updatePreviewPhotoLabel();
    });

    photoThumbs.appendChild(div);
  });
  filterBar.hidden = state.photos.length === 0;
}

/* ── Sync filter/zoom UI controls to the active photo ── */
function syncFilterUI(photo) {
  if (!photo) return;
  filterBar.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === photo.filter)
  );
  document.getElementById('ctrlBrightness').value = photo.brightness;
  document.getElementById('ctrlBrightnessVal').textContent = photo.brightness;
  document.getElementById('ctrlContrast').value = photo.contrast;
  document.getElementById('ctrlContrastVal').textContent = photo.contrast;
  const zoomPct = Math.round(photo.scale * 100);
  document.getElementById('ctrlPhotoZoom').value = zoomPct;
  document.getElementById('ctrlPhotoZoomVal').textContent = zoomPct + '%';
  const rot = Math.round(photo.rotation || 0);
  document.getElementById('ctrlPhotoRotate').value = rot;
  document.getElementById('ctrlPhotoRotateVal').textContent = rot + '°';
  document.getElementById('ctrlPhotoBgColor').value = photo.bgColor || '#ffffff';
  document.getElementById('ctrlPhotoBgColorText').value = photo.bgColor || '#ffffff';
  document.getElementById('frameHue').value = photo.frameHue ?? 0;
  document.getElementById('frameHueVal').textContent = (photo.frameHue ?? 0) + '°';
  document.getElementById('frameSat').value = photo.frameSat ?? 100;
  document.getElementById('frameSatVal').textContent = (photo.frameSat ?? 100) + '%';
}

// Filter bar — applies to the active photo
filterBar.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.filter = btn.dataset.filter;
  filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
  renderThumbs();
  schedulePreviewRedraw();
});

// Emoji mode
document.getElementById('emojiWith').addEventListener('click', () => {
  state.emojiMode = 'with';
  document.getElementById('emojiWith').classList.add('active');
  document.getElementById('emojiWithout').classList.remove('active');
});
document.getElementById('emojiWithout').addEventListener('click', () => {
  state.emojiMode = 'without';
  document.getElementById('emojiWithout').classList.add('active');
  document.getElementById('emojiWith').classList.remove('active');
});

/* ════════════════════════════════════════
   Frame loading & selection
   ════════════════════════════════════════ */
async function loadFrames() {
  try {
    const res = await fetch('/api/frames');
    const frames = await res.json();
    state.availableFrames = frames;
    renderFrameGrid(frames);
  } catch {
    frameGrid.innerHTML = '<div class="frame-loading" style="color:#e55">フレームの読み込みに失敗しました</div>';
  }
}

function renderFrameGrid(frames) {
  frameGrid.innerHTML = '';
  if (!frames.length) {
    frameGrid.innerHTML = '<div class="frame-loading">フレームがありません。「追加」から追加してください。</div>';
    return;
  }
  const activePhoto = state.photos[state.previewPhotoIdx];
  frames.forEach(frame => {
    const assignedIndices = state.photos.map((p, i) => p.frameId === frame.id ? i : -1).filter(i => i >= 0);
    const isSelectedByActive = activePhoto?.frameId === frame.id;
    const card = document.createElement('div');
    card.className = 'frame-card' + (isSelectedByActive ? ' selected' : '');
    card.dataset.id = frame.id;
    const badgeText = assignedIndices.map(i => `写${i + 1}`).join('・');
    card.innerHTML = `
      <img class="frame-thumb" src="${frame.overlayUrl}" alt="${frame.name}" loading="lazy">
      <div class="frame-name">${frame.name}</div>
      <div class="frame-check">✓</div>
      ${assignedIndices.length > 0 ? `<span class="frame-photo-badge">${badgeText}</span>` : ''}
      <button class="frame-delete" title="削除">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;
    card.querySelector('.frame-delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteFrame(frame, card);
    });
    card.addEventListener('click', () => toggleFrame(frame, card));
    frameGrid.appendChild(card);
  });
}

function toggleFrame(frame) {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) { showToast('先に写真を追加してください'); return; }

  if (photo.frameId === frame.id) {
    photo.frameId = null;
  } else {
    photo.frameId = frame.id;
  }
  renderFrameGrid(state.availableFrames);
  renderThumbs();
  updateGenerateBtn();
  schedulePreviewRedraw();
}

async function deleteFrame(frame) {
  if (!confirm(`「${frame.name}」を削除しますか？`)) return;
  try {
    const res = await fetch(`/api/frames/${frame.id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error);
    // Clear assignment from any photo
    state.photos.forEach(p => { if (p.frameId === frame.id) p.frameId = null; });
    state.availableFrames = state.availableFrames.filter(f => f.id !== frame.id);
    renderFrameGrid(state.availableFrames);
    renderThumbs();
    updateGenerateBtn();
    showToast(`「${frame.name}」を削除しました`);
  } catch (err) {
    showToast('削除に失敗しました: ' + err.message, 3000);
  }
}

function updateGenerateBtn() {
  const hasPhoto = state.photos.length > 0;
  const hasDesc  = descriptionEl.value.trim().length >= 5;
  btnGenerate.disabled = !(hasPhoto && hasDesc);
}
descriptionEl.addEventListener('input', updateGenerateBtn);

/* ════════════════════════════════════════
   Frame Add Modal
   ════════════════════════════════════════ */
const modal = { overlayBase64: null, overlayExt: 'svg', overlayImg: null };

function openModal() {
  modal.overlayBase64 = null;
  modal.overlayExt = 'svg';
  modal.overlayImg = null;
  document.getElementById('frameName').value = '';
  document.getElementById('frameDesc').value = '';
  document.getElementById('hl-x').value = 72;
  document.getElementById('hl-y').value = 148;
  document.getElementById('hl-w').value = 780;
  document.getElementById('hl-size').value = 82;
  document.getElementById('hl-color').value = '#1a1a1a';
  document.getElementById('hl-color-text').value = '#1a1a1a';
  document.getElementById('hl-shadow').value = 0;
  document.getElementById('sub-x').value = 52;
  document.getElementById('sub-y').value = 340;
  document.getElementById('sub-size').value = 22;
  document.getElementById('sub-color').value = '#2a2a2a';
  document.getElementById('sub-color-text').value = '#2a2a2a';
  document.getElementById('sub-vertical').checked = true;
  modalUploadZone.classList.remove('has-file');
  modalUploadZone.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
    <p>SVG または PNG をドロップ<br><small>（1080×1350px 推奨）</small></p>
    <input type="file" id="frameFileInput" accept=".svg,.png,image/svg+xml,image/png" hidden>
  `;
  document.getElementById('frameFileInput').addEventListener('change', e => handleFrameFile(e.target.files[0]));
  previewHint.classList.remove('hidden');
  btnModalSave.disabled = true;
  drawBlankPreview();
  frameModal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  frameModal.hidden = true;
  document.body.style.overflow = '';
}

btnAddFrame.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
btnModalCancel.addEventListener('click', closeModal);
frameModal.addEventListener('click', e => { if (e.target === frameModal) closeModal(); });

modalUploadZone.addEventListener('click', () => document.getElementById('frameFileInput')?.click());
modalUploadZone.addEventListener('dragover', e => { e.preventDefault(); modalUploadZone.classList.add('drag-over'); });
modalUploadZone.addEventListener('dragleave', () => modalUploadZone.classList.remove('drag-over'));
modalUploadZone.addEventListener('drop', e => {
  e.preventDefault();
  modalUploadZone.classList.remove('drag-over');
  const file = [...e.dataTransfer.files].find(f => f.type.includes('svg') || f.type === 'image/png');
  if (file) handleFrameFile(file);
});

function handleFrameFile(file) {
  if (!file) return;
  const ext = file.name.endsWith('.svg') || file.type.includes('svg') ? 'svg' : 'png';
  modal.overlayExt = ext;
  const reader = new FileReader();
  reader.onload = async e => {
    modal.overlayBase64 = e.target.result;
    modalUploadZone.classList.add('has-file');
    const label = modalUploadZone.querySelector('p');
    if (label) label.innerHTML = `<strong>${file.name}</strong><br><small>クリックで変更</small>`;
    modal.overlayImg = await loadImg(modal.overlayBase64).catch(() => null);
    previewHint.classList.add('hidden');
    updateSaveBtn();
    drawModalPreview();
  };
  reader.readAsDataURL(file);
}

function syncColor(pickerId, textId, callback) {
  const picker = document.getElementById(pickerId);
  const text   = document.getElementById(textId);
  picker.addEventListener('input', () => { text.value = picker.value; callback?.(); });
  text.addEventListener('input', () => {
    if (/^#[0-9a-fA-F]{6}$/.test(text.value)) { picker.value = text.value; callback?.(); }
  });
}
syncColor('hl-color', 'hl-color-text', drawModalPreview);
syncColor('sub-color', 'sub-color-text', drawModalPreview);

['hl-x','hl-y','hl-w','hl-size','hl-shadow','sub-x','sub-y','sub-size','sub-vertical'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', drawModalPreview);
});

function getModalConfig() {
  return {
    canvasWidth: 1080, canvasHeight: 1350,
    headline: {
      x: +document.getElementById('hl-x').value,
      y: +document.getElementById('hl-y').value,
      maxWidth: +document.getElementById('hl-w').value,
      fontSize: +document.getElementById('hl-size').value,
      fontWeight: '900',
      color: document.getElementById('hl-color').value,
      lineHeight: +document.getElementById('hl-size').value * 1.15,
      shadowBlur: +document.getElementById('hl-shadow').value,
      shadowColor: 'rgba(0,0,0,0.2)',
    },
    subtitle: {
      x: +document.getElementById('sub-x').value,
      y: +document.getElementById('sub-y').value,
      fontSize: +document.getElementById('sub-size').value,
      color: document.getElementById('sub-color').value,
      letterSpacing: 3,
      vertical: document.getElementById('sub-vertical').checked,
      maxChars: 50,
    },
    branding: {
      logoX: 944, logoY: 58, logoSize: 50,
      nameX: 200, nameY: 1302,
      nameFontSizeJa: 34, nameFontSizeEn: 15,
      nameColor: '#ffffff',
      nameEnX: 640, nameEnY1: 1293, nameEnY2: 1316,
    },
  };
}

function drawBlankPreview() {
  const ctx = framePreviewCanvas.getContext('2d');
  ctx.clearRect(0, 0, framePreviewCanvas.width, framePreviewCanvas.height);
  ctx.fillStyle = '#f0ebe8';
  ctx.fillRect(0, 0, framePreviewCanvas.width, framePreviewCanvas.height);
}

function drawModalPreview() {
  if (!modal.overlayImg) return;
  const canvas = framePreviewCanvas;
  const ctx = canvas.getContext('2d');
  const S = canvas.width / 1080;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(modal.overlayImg, 0, 0, canvas.width, canvas.height);
  const cfg = getModalConfig();
  const hl = cfg.headline;
  ctx.save();
  if (hl.shadowBlur > 0) { ctx.shadowColor = hl.shadowColor; ctx.shadowBlur = hl.shadowBlur * S; }
  ctx.fillStyle = hl.color;
  ctx.font = `900 ${hl.fontSize * S}px "Hiragino Sans", sans-serif`;
  ctx.textBaseline = 'top';
  wrapText(ctx, 'キャッチコピー', hl.x * S, hl.y * S, hl.maxWidth * S, hl.lineHeight * S);
  ctx.restore();
  const sub = cfg.subtitle;
  ctx.save();
  ctx.fillStyle = sub.color;
  ctx.font = `${sub.fontSize * S}px "Inter", sans-serif`;
  ctx.textBaseline = 'middle';
  if (sub.vertical) {
    ctx.translate((sub.x + sub.fontSize) * S, sub.y * S);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Sample English subtitle', 0, 0);
  } else {
    ctx.fillText('Sample English subtitle', sub.x * S, sub.y * S);
  }
  ctx.restore();
}

function updateSaveBtn() {
  btnModalSave.disabled = !modal.overlayBase64 || !document.getElementById('frameName').value.trim();
}
document.getElementById('frameName').addEventListener('input', updateSaveBtn);

btnModalSave.addEventListener('click', async () => {
  const name = document.getElementById('frameName').value.trim();
  const description = document.getElementById('frameDesc').value.trim();
  if (!name || !modal.overlayBase64) return;
  btnModalSave.disabled = true;
  btnModalSave.textContent = '保存中…';
  try {
    const res = await fetch('/api/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, overlayBase64: modal.overlayBase64, ext: modal.overlayExt, config: getModalConfig() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    state.availableFrames.push(data);
    renderFrameGrid(state.availableFrames);
    closeModal();
    showToast(`「${name}」を追加しました`);
  } catch (err) {
    showToast('保存に失敗しました: ' + err.message, 3500);
  } finally {
    btnModalSave.disabled = false;
    btnModalSave.textContent = '保存する';
    updateSaveBtn();
  }
});

/* ════════════════════════════════════════
   Settings (Ollama)
   ════════════════════════════════════════ */
function openSettingsModal() {
  settingsModal.hidden = false;
  document.body.style.overflow = 'hidden';
  refreshOllamaModels();
  loadGeminiSettings();
  renderFontManager();
}
function closeSettingsModal() {
  settingsModal.hidden = true;
  document.body.style.overflow = '';
}
btnSettings.addEventListener('click', openSettingsModal);
settingsModalClose.addEventListener('click', closeSettingsModal);
btnSettingsCancel.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) closeSettingsModal(); });

aiStatus.addEventListener('click', () => {
  if (aiStatus.classList.contains('warn')) openSettingsModal();
});

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    if (data.ollamaOk) {
      aiStatus.classList.remove('warn');
      aiStatus.innerHTML = '<span class="dot"></span> Gemini 設定済み';
    } else {
      aiStatus.classList.add('warn');
      aiStatus.innerHTML = '<span class="dot"></span> Gemini 未設定';
    }
    if (!settingsModal.hidden) setOllamaStatusUI(data.ollamaOk, data.ollamaModel);
  } catch {
    aiStatus.classList.add('warn');
    aiStatus.innerHTML = '<span class="dot"></span> 確認中…';
  }
}

function setOllamaStatusUI(ok, currentModel) {
  if (ok) {
    ollamaStatusDot.className = 'ollama-dot ollama-ok';
    ollamaStatusText.textContent = '接続済み';
  } else {
    ollamaStatusDot.className = 'ollama-dot ollama-ng';
    ollamaStatusText.textContent = '未起動 — ターミナルで `ollama serve` を実行してください';
  }
  if (currentModel && modelSelect.querySelector(`option[value="${currentModel}"]`)) {
    modelSelect.value = currentModel;
  }
}

async function refreshOllamaModels() {
  modelSelect.innerHTML = '<option value="">読み込み中…</option>';
  try {
    const [settingsRes, modelsRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/ollama-models'),
    ]);
    const settings = await settingsRes.json();
    const modelsData = await modelsRes.json();
    const models = modelsData.models || [];

    if (!models.length) {
      modelSelect.innerHTML = '<option value="">モデルが見つかりません</option>';
    } else {
      modelSelect.innerHTML = models.map(m =>
        `<option value="${m}">${m}</option>`
      ).join('');
    }
    setOllamaStatusUI(settings.ollamaOk, settings.ollamaModel);
  } catch {
    modelSelect.innerHTML = '<option value="">接続エラー</option>';
    setOllamaStatusUI(false, '');
  }
}

btnRefreshModels.addEventListener('click', refreshOllamaModels);

btnSettingsSave.addEventListener('click', async () => {
  const ollamaModel = modelSelect.value;
  if (!ollamaModel) { showToast('モデルを選択してください'); return; }
  btnSettingsSave.disabled = true;
  btnSettingsSave.textContent = '保存中…';
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollamaModel }),
    });
    if (!res.ok) throw new Error((await res.json()).error);

    // Gemini: only send the key if the user actually typed a new one
    // (leaving it blank keeps whatever key is already saved).
    const geminiPayload = {};
    if (geminiApiKeyInput.value.trim()) geminiPayload.apiKey = geminiApiKeyInput.value.trim();
    if (geminiModelSelect.value) geminiPayload.model = geminiModelSelect.value;
    if (Object.keys(geminiPayload).length) {
      const gRes = await fetch('/api/gemini-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });
      const gData = await gRes.json();
      setGeminiStatusUI(gData.hasKey, gData.geminiOk);
    }

    showToast('設定を保存しました');
    closeSettingsModal();
    loadSettings();
  } catch (err) {
    showToast('保存に失敗しました: ' + err.message, 3500);
  } finally {
    btnSettingsSave.disabled = false;
    btnSettingsSave.textContent = '保存する';
  }
});

btnOpenOutput.addEventListener('click', async () => {
  try {
    await fetch('/api/open-output', { method: 'POST' });
  } catch (err) {
    showToast('エラー: ' + err.message, 3000);
  }
});

/* ════════════════════════════════════════
   Settings (Gemini API — priority provider)
   ════════════════════════════════════════ */
function setGeminiStatusUI(hasKey, geminiOk) {
  if (hasKey && geminiOk) {
    geminiStatusDot.className = 'ollama-dot ollama-ok';
    geminiStatusText.textContent = '接続済み（優先使用中）';
  } else if (hasKey) {
    geminiStatusDot.className = 'ollama-dot ollama-ng';
    geminiStatusText.textContent = 'キーが無効か接続できません';
  } else {
    geminiStatusDot.className = 'ollama-dot';
    geminiStatusText.textContent = '未設定';
  }
}

async function loadGeminiSettings() {
  geminiApiKeyInput.value = '';
  try {
    const res = await fetch('/api/gemini-settings');
    const data = await res.json();
    setGeminiStatusUI(data.hasKey, data.geminiOk);
    geminiApiKeyInput.placeholder = data.hasKey
      ? `設定済み（末尾: ${data.keyHint}）変更する場合のみ入力`
      : 'APIキーを入力（AIza...）';
    if (data.hasKey) {
      await refreshGeminiModels(data.model);
    } else {
      geminiModelSelect.innerHTML = '<option value="">APIキー未設定</option>';
    }
  } catch {
    setGeminiStatusUI(false, false);
  }
}

async function refreshGeminiModels(preferredModel) {
  geminiModelSelect.innerHTML = '<option value="">読み込み中…</option>';
  try {
    const res = await fetch('/api/gemini-models');
    const data = await res.json();
    const models = data.models || [];
    if (!models.length) {
      geminiModelSelect.innerHTML = '<option value="">モデルが見つかりません</option>';
      return;
    }
    geminiModelSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
    const want = preferredModel || 'gemini-3.1-flash-lite';
    if (models.includes(want)) {
      geminiModelSelect.value = want;
    } else if (models.some(m => m.includes('flash-lite'))) {
      geminiModelSelect.value = models.find(m => m.includes('flash-lite'));
    }
  } catch {
    geminiModelSelect.innerHTML = '<option value="">接続エラー</option>';
  }
}

btnRefreshGeminiModels.addEventListener('click', () => refreshGeminiModels(geminiModelSelect.value));

/* ════════════════════════════════════════
   AI Generate (copy only)
   ════════════════════════════════════════ */
async function runGenerate(keepStyle) {
  const desc = descriptionEl.value.trim();
  if (!state.photos.length || !desc) return;

  setOutput('loading');
  loadingMsg.textContent = 'ローカルAIがコピーを生成中…（初回は数十秒かかる場合があります）';

  try {
    const res = await fetch('/api/generate-copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: desc,
        emojiMode: state.emojiMode,
        photoCount: state.photos.length,
        referenceText: (document.getElementById('referenceText')?.value || '').trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.needsOllama) openSettingsModal();
      throw new Error(data.error || '生成に失敗しました');
    }
    state.generatedCopy = data;
    initTextEditor(keepStyle);
    setOutput('editing');
    if (data._provider === 'gemini') showToast('Gemini APIで生成しました');
    else if (data._provider === 'ollama') showToast('ローカルAI(Ollama)で生成しました');
  } catch (err) {
    setOutput('empty');
    showToast('エラー: ' + err.message, 5000);
  }
}

btnGenerate.addEventListener('click', () => runGenerate(false));
btnRegenerate.addEventListener('click', () => {
  loadingMsg.textContent = 'AIで再生成中…';
  runGenerate(true);
});

/* ════════════════════════════════════════
   Text Editor — per-photo textStyle
   ════════════════════════════════════════ */
function initTextEditor(isRegenerate = false) {
  const generatedHeadlines = state.generatedCopy.headlines || [state.generatedCopy.headline || ''];
  const newSubtitle = state.generatedCopy.subtitle || '';

  state.photos.forEach((photo, i) => {
    // A frame is optional — headline/subtitle render regardless (with generic
    // defaults below when there's no frame to seed position/colour from).
    const frame = photo.frameId ? state.availableFrames.find(f => f.id === photo.frameId) : null;
    const cfgHl  = frame?.config?.headline || {};
    const cfgSub = frame?.config?.subtitle || {};
    const headline = generatedHeadlines[i] ?? generatedHeadlines[0] ?? '';

    if (isRegenerate && photo.textStyle) {
      photo.textStyle.headline = headline;
      photo.textStyle.subtitle = newSubtitle;
    } else {
      photo.textStyle = {
        headline,
        subtitle: newSubtitle,
        fontFamily:         'Hiragino Sans',
        fontWeight:         '900',
        fontSize:           cfgHl.fontSize || 82,
        color:              cfgHl.color || '#1a1a1a',
        x:                  cfgHl.x ?? 72,
        y:                  cfgHl.y ?? 148,
        maxWidth:           cfgHl.maxWidth || 780,
        headlineVertical:   false,
        arcRadius:          0,   // 0 = not arched; sign flips upward/downward arch
        whiteBg:            false,
        whiteBgColor:       '#ffffff',
        whiteBgPad:         16,
        whiteBgEndTrims:    {},
        letterSpacing:      0,
        lineSpacing:        115,
        charKerns:          {},
        showSubtitle:       true,
        subX:               cfgSub.x ?? 52,
        subY:               cfgSub.y ?? 340,
        subColor:           cfgSub.color || '#2a2a2a',
        subtitleVertical:   cfgSub.vertical !== false,
        subtitleFontFamily: 'Inter',
        subtitleFontWeight: '400',
        subFontSize:        cfgSub.fontSize ?? 22,
        subLetterSpacing:   0,
        subLineSpacing:     140,
      };
    }
  });

  state.textStyle = state.photos[state.previewPhotoIdx]?.textStyle || null;

  state.activeCaptionIdx = 0;
  renderCaption(0);

  const activePhoto = state.photos[state.previewPhotoIdx];
  if (activePhoto) syncFilterUI(activePhoto);
  if (state.textStyle) syncTextStyleUI();

  state.selectedIconId = activePhoto?.icons?.length ? activePhoto.icons[activePhoto.icons.length - 1].id : null;
  state.selectedTextId = null;
  renderCtList();
  renderCtSettings();
  renderPlacedIcons();
  renderIconSettings();

  updatePreviewPhotoLabel();
  schedulePreviewRedraw();
}

/* ── Sync all text-style UI controls from state.textStyle ── */
function syncTextStyleUI() {
  const ts = state.textStyle;
  if (!ts) return;
  editHeadline.value = ts.headline;
  editSubtitle.value = ts.subtitle;
  document.getElementById('ctrlFont').value          = ts.fontFamily;
  document.getElementById('ctrlFontWeight').value    = ts.fontWeight;
  document.getElementById('ctrlSize').value          = ts.fontSize;
  document.getElementById('ctrlSizeVal').textContent = ts.fontSize;
  document.getElementById('ctrlColor').value         = ts.color;
  document.getElementById('ctrlColorText').value     = ts.color;
  document.getElementById('ctrlWhiteBg').checked     = ts.whiteBg;
  document.getElementById('ctrlBgColorRow').hidden   = !ts.whiteBg;
  document.getElementById('ctrlBgColor').value       = ts.whiteBgColor;
  document.getElementById('ctrlBgColorText').value   = ts.whiteBgColor;
  document.getElementById('ctrlPosX').value          = ts.x;
  document.getElementById('ctrlPosXVal').textContent = ts.x;
  document.getElementById('ctrlPosY').value          = ts.y;
  document.getElementById('ctrlPosYVal').textContent = ts.y;
  document.getElementById('ctrlMaxW').value          = ts.maxWidth;
  document.getElementById('ctrlMaxWVal').textContent = ts.maxWidth;
  document.getElementById('ctrlLetterSpacing').value = ts.letterSpacing ?? 0;
  document.getElementById('ctrlLetterSpacingVal').textContent = ts.letterSpacing ?? 0;
  document.getElementById('ctrlLineSpacing').value   = ts.lineSpacing ?? 115;
  document.getElementById('ctrlLineSpacingVal').textContent = (ts.lineSpacing ?? 115) + '%';
  const hlMode = ts.arcRadius ? 'arc' : (ts.headlineVertical ? 'vertical' : 'horizontal');
  document.getElementById('ctrlHlHoriz').classList.toggle('active', hlMode === 'horizontal');
  document.getElementById('ctrlHlVert').classList.toggle('active',  hlMode === 'vertical');
  document.getElementById('ctrlHlArc').classList.toggle('active',   hlMode === 'arc');
  document.getElementById('ctrlArcRadiusRow').hidden = hlMode !== 'arc';
  document.getElementById('ctrlArcRadius').value = ts.arcRadius || 500;
  document.getElementById('ctrlArcRadiusVal').textContent = ts.arcRadius || 500;
  document.getElementById('ctrlSubFont').value          = ts.subtitleFontFamily;
  document.getElementById('ctrlSubFontWeight').value    = ts.subtitleFontWeight;
  document.getElementById('ctrlSubSize').value          = ts.subFontSize ?? 22;
  document.getElementById('ctrlSubSizeVal').textContent = ts.subFontSize ?? 22;
  document.getElementById('ctrlSubLetterSpacing').value = ts.subLetterSpacing ?? 0;
  document.getElementById('ctrlSubLetterSpacingVal').textContent = ts.subLetterSpacing ?? 0;
  document.getElementById('ctrlSubLineSpacing').value   = ts.subLineSpacing ?? 140;
  document.getElementById('ctrlSubLineSpacingVal').textContent = (ts.subLineSpacing ?? 140) + '%';
  document.getElementById('ctrlShowSub').checked        = ts.showSubtitle;
  document.getElementById('ctrlSubColor').value         = ts.subColor || '#2a2a2a';
  document.getElementById('ctrlSubColorText').value     = ts.subColor || '#2a2a2a';
  document.getElementById('ctrlSubX').value             = ts.subX;
  document.getElementById('ctrlSubXVal').textContent    = ts.subX;
  document.getElementById('ctrlSubY').value             = ts.subY;
  document.getElementById('ctrlSubYVal').textContent    = ts.subY;
  document.getElementById('ctrlSubHoriz').classList.toggle('active', !ts.subtitleVertical);
  document.getElementById('ctrlSubVert').classList.toggle('active',   ts.subtitleVertical);
}

/* ── Switch active photo and sync all UI ── */
function switchToPhoto(idx) {
  state.previewPhotoIdx = idx;
  const photo = state.photos[idx];
  state.textStyle = photo?.textStyle || null;
  state.selectedIconId = photo?.icons?.length ? photo.icons[photo.icons.length - 1].id : null;
  // Custom texts are per-photo — a selection/kern cursor carried over from the
  // previous photo would point at an element that isn't on screen.
  state.selectedTextId = null;
  state.kernCursor = null;
  state.kernTargetId = null;
  renderThumbs();
  renderFrameGrid(state.availableFrames);
  if (photo) syncFilterUI(photo);
  if (state.textStyle) syncTextStyleUI();
  renderCtList();
  renderCtSettings();
  renderPlacedIcons();
  renderIconSettings();
  updatePreviewPhotoLabel();
  schedulePreviewRedraw();
}

/* ════════════════════════════════════════
   Layout copy/paste across photos —
   copies headline/subtitle/photo/icon *positioning* (not text content,
   color, or font choices) from the active photo onto other photo(s).
   ════════════════════════════════════════ */
let layoutClipboard = null;

function snapshotLayout(photo) {
  if (!photo) return null;
  const ts = photo.textStyle || {};
  return {
    fontSize: ts.fontSize, x: ts.x, y: ts.y, maxWidth: ts.maxWidth,
    headlineVertical: ts.headlineVertical, arcRadius: ts.arcRadius,
    whiteBg: ts.whiteBg, whiteBgColor: ts.whiteBgColor, whiteBgPad: ts.whiteBgPad,
    whiteBgEndTrims: ts.whiteBgEndTrims ? { ...ts.whiteBgEndTrims } : {},
    letterSpacing: ts.letterSpacing, lineSpacing: ts.lineSpacing,
    charKerns: ts.charKerns ? { ...ts.charKerns } : {},
    showSubtitle: ts.showSubtitle, subX: ts.subX, subY: ts.subY,
    subtitleVertical: ts.subtitleVertical,
    subLetterSpacing: ts.subLetterSpacing, subLineSpacing: ts.subLineSpacing,
    photoOffset: { ...photo.offset }, photoScale: photo.scale, photoRotation: photo.rotation,
    icons: (photo.icons || []).map(ic => ({ x: ic.x, y: ic.y, scale: ic.scale, rotation: ic.rotation, opacity: ic.opacity })),
    texts: (photo.texts || []).map(t => ({
      x: t.x, y: t.y, maxWidth: t.maxWidth, fontSize: t.fontSize,
      vertical: t.vertical, letterSpacing: t.letterSpacing, lineSpacing: t.lineSpacing,
      charKerns: { ...(t.charKerns || {}) },
      whiteBg: t.whiteBg, whiteBgColor: t.whiteBgColor, whiteBgPad: t.whiteBgPad,
      whiteBgEndTrims: { ...(t.whiteBgEndTrims || {}) },
    })),
  };
}

function applyLayoutSnapshot(photo, snap) {
  if (!photo || !snap) return;
  if (photo.textStyle) {
    Object.assign(photo.textStyle, {
      fontSize: snap.fontSize, x: snap.x, y: snap.y, maxWidth: snap.maxWidth,
      headlineVertical: snap.headlineVertical, arcRadius: snap.arcRadius,
      whiteBg: snap.whiteBg, whiteBgColor: snap.whiteBgColor, whiteBgPad: snap.whiteBgPad,
      whiteBgEndTrims: { ...snap.whiteBgEndTrims },
      letterSpacing: snap.letterSpacing, lineSpacing: snap.lineSpacing,
      charKerns: { ...snap.charKerns },
      showSubtitle: snap.showSubtitle, subX: snap.subX, subY: snap.subY,
      subtitleVertical: snap.subtitleVertical,
      subLetterSpacing: snap.subLetterSpacing, subLineSpacing: snap.subLineSpacing,
    });
  }
  photo.offset = { ...snap.photoOffset };
  photo.scale = snap.photoScale;
  photo.rotation = snap.photoRotation;
  photo.icons.forEach((ic, i) => {
    const s = snap.icons[i];
    if (s) Object.assign(ic, { x: s.x, y: s.y, scale: s.scale, rotation: s.rotation, opacity: s.opacity });
  });
  // Custom texts are matched by index, like icons — positioning/spacing only,
  // never the text content itself (each photo keeps its own wording).
  (photo.texts || []).forEach((t, i) => {
    const s = (snap.texts || [])[i];
    if (!s) return;
    Object.assign(t, {
      x: s.x, y: s.y, maxWidth: s.maxWidth, fontSize: s.fontSize,
      vertical: s.vertical, letterSpacing: s.letterSpacing, lineSpacing: s.lineSpacing,
      charKerns: { ...(s.charKerns || {}) },
      whiteBg: s.whiteBg, whiteBgColor: s.whiteBgColor, whiteBgPad: s.whiteBgPad,
      whiteBgEndTrims: { ...(s.whiteBgEndTrims || {}) },
    });
  });
}

document.getElementById('btnCopyLayout').addEventListener('click', () => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  layoutClipboard = snapshotLayout(photo);
  document.getElementById('btnPasteLayout').disabled = false;
  document.getElementById('btnPasteLayoutAll').disabled = false;
  showToast('レイアウトをコピーしました');
});

document.getElementById('btnPasteLayout').addEventListener('click', () => {
  if (!layoutClipboard) return;
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  applyLayoutSnapshot(photo, layoutClipboard);
  switchToPhoto(state.previewPhotoIdx);
  showToast('レイアウトを貼り付けました');
});

document.getElementById('btnPasteLayoutAll').addEventListener('click', () => {
  if (!layoutClipboard) return;
  const sourceIdx = state.previewPhotoIdx;
  let count = 0;
  state.photos.forEach((p, i) => {
    if (i === sourceIdx) return;
    applyLayoutSnapshot(p, layoutClipboard);
    count++;
  });
  switchToPhoto(state.previewPhotoIdx);
  showToast(`他の${count}枚の画像にレイアウトを貼り付けました`);
});

// ── Preview canvas ──
let previewRafId = null;
function schedulePreviewRedraw() {
  if (!previewRafId) previewRafId = requestAnimationFrame(async () => {
    previewRafId = null;
    await drawEditPreview();
    renderBgTrimSliders();   // refresh per-line sliders after layout is computed
    renderCtBgTrimSliders(); // same, for the selected custom text box
  });
}

/* ── Dynamically render per-line/column whiteBg trim sliders ── */
function renderBgTrimSliders() {
  const container = document.getElementById('ctrlBgEndRows');
  if (!container) return;
  const ts = state.textStyle;
  if (!ts || !ts.whiteBg) { container.innerHTML = ''; return; }

  const layout = state._hlLayout;
  if (!layout || !layout.length) { container.innerHTML = ''; return; }

  const lineIndices = [...new Set(layout.map(it => it.lineIdx))].sort((a, b) => a - b);
  const isVert = ts.headlineVertical;
  const trims = ts.whiteBgEndTrims || {};

  container.innerHTML = lineIndices.map(li => {
    const label = isVert ? `列${li + 1}末尾` : `行${li + 1}末尾`;
    const val = trims[li] ?? 0;
    return `<div class="edit-ctrl-row">
      <label>${label}</label>
      <input type="range" class="bg-trim-slider" data-li="${li}" min="-200" max="800" value="${val}">
      <span class="ctrl-val bg-trim-val" data-li="${li}">${val}</span>
    </div>`;
  }).join('');
}

async function drawEditPreview() {
  const canvas = editPreviewCanvas;
  const ctx    = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const S = W / 1080;

  ctx.clearRect(0, 0, W, H);

  const activePhoto = state.photos[state.previewPhotoIdx];

  if (!activePhoto) {
    ctx.fillStyle = '#f0ebe8';
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const frame = activePhoto.frameId
    ? state.availableFrames.find(f => f.id === activePhoto.frameId)
    : null;

  try {
    // Rebuilt fresh each frame — the headline and every custom text box that
    // has a white background contribute their own trim handles here, each
    // tagged with the text it belongs to (ownerId null = headline).
    state._bgRects = [];

    // Background colour — visible once zoom shrinks the photo below the
    // frame-filling default (100%), revealing the canvas behind it.
    ctx.fillStyle = activePhoto.bgColor || '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Photo with per-photo filter, offset, scale, rotation
    const photoImg = await cachedImg(activePhoto.url);
    const baseSc = Math.max(W / photoImg.width, H / photoImg.height);
    const sc = baseSc * activePhoto.scale;
    const pw = photoImg.width * sc, ph = photoImg.height * sc;
    const pcx = W / 2 + activePhoto.offset.x * S;
    const pcy = H / 2 + activePhoto.offset.y * S;
    const rot = (activePhoto.rotation || 0) * Math.PI / 180;
    const filterStr = buildFilterStringFor(activePhoto);
    ctx.save();
    if (filterStr !== 'none') ctx.filter = filterStr;
    ctx.translate(pcx, pcy);
    ctx.rotate(rot);
    ctx.drawImage(photoImg, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();

    // Frame overlay with hue/sat filter — headline/subtitle/icons below are
    // independent of this and still render even when no frame is assigned.
    if (frame) {
      const overlayImg = await cachedImg(frame.overlayUrl);
      const frameFilter = buildFrameFilter();
      ctx.save();
      if (frameFilter !== 'none') ctx.filter = frameFilter;
      ctx.drawImage(overlayImg, 0, 0, W, H);
      ctx.restore();
    }

    // Text
    const ts = state.textStyle;
    if (!ts) return;
    const hlFamily = fontFamilyCSS(ts.fontFamily);
    const textX = ts.x * S;
    const textY = ts.y * S;
    const maxW  = ts.maxWidth * S;
    const lineSpacingPct = ts.lineSpacing ?? 115;
    const fontSizePx = ts.fontSize * S;
    const lineH = fontSizePx * (lineSpacingPct / 100);          // horizontal line step
    const letterSpacingPx = (ts.letterSpacing || 0) * S;
    const charKernsScaled = Object.fromEntries(
      Object.entries(ts.charKerns || {}).map(([k, v]) => [k, v * S])
    );
    // Vertical: 文字間 = char advance, 行間 = column step
    const vCharAdvance = fontSizePx + letterSpacingPx;
    const vColStep     = fontSizePx * (lineSpacingPct / 100);

    ctx.font = `${ts.fontWeight} ${fontSizePx}px ${hlFamily}`;

    // Build layout
    let hlLayout;
    if (ts.arcRadius) {
      hlLayout = layoutHeadlineArc(ctx, ts.headline, textX, textY, ts.arcRadius * S, letterSpacingPx, lineH, charKernsScaled).layout;
    } else if (ts.headlineVertical) {
      hlLayout = layoutHeadlineV(ctx, ts.headline, textX, textY, vCharAdvance, vColStep, fontSizePx, charKernsScaled).layout;
    } else {
      hlLayout = layoutHeadlineH(ctx, ts.headline, textX, textY, maxW, lineH, letterSpacingPx, charKernsScaled).layout;
    }
    state._hlLayout = hlLayout;
    state._fontSizePx = fontSizePx;

    // White background — per line/column with symmetric padding
    if (ts.whiteBg) {
      const pad = ts.whiteBgPad * S;
      // Scale each per-line trim from 1080-space to canvas pixels
      const trimsObj = ts.whiteBgEndTrims || {};
      const trimsScaled = Object.fromEntries(Object.entries(trimsObj).map(([k,v]) => [k, v * S]));
      drawTextBgFromLayout(ctx, hlLayout, ts.whiteBgColor, pad, fontSizePx, trimsScaled);

      // Draw drag handles at the trailing edge of each bg rect (yellow triangle)
      const bgRects = getTextBgRects(hlLayout, pad, fontSizePx, trimsScaled);
      state._bgRects.push(...bgRects.map(r => ({ ...r, ownerId: null })));
      ctx.save();
      ctx.fillStyle = '#E0A83A';
      const hs = 10; // handle half-size in px
      for (const r of bgRects) {
        if (r.vertical) {
          const hx = r.x + r.w / 2, hy = r.y + r.h;
          ctx.beginPath(); ctx.moveTo(hx - hs, hy); ctx.lineTo(hx + hs, hy); ctx.lineTo(hx, hy + hs); ctx.closePath(); ctx.fill();
        } else {
          const hx = r.x + r.w, hy = r.y + r.h / 2;
          ctx.beginPath(); ctx.moveTo(hx, hy - hs); ctx.lineTo(hx, hy + hs); ctx.lineTo(hx + hs, hy); ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }

    // Headline text
    ctx.save();
    ctx.fillStyle = ts.color;
    ctx.textBaseline = 'top';
    drawCharLayout(ctx, hlLayout, fontSizePx);
    ctx.restore();

    // Kern cursor indicator (orange line at the gap)
    drawKernCursor(ctx, hlLayout, fontSizePx, letterSpacingPx, charKernsScaled);

    // Headline drag indicator (pink dashed) from layout bounds
    state._hlHandles = null;
    if (hlLayout.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const it of hlLayout) {
        minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
        maxX = Math.max(maxX, it.x + (it.vertical ? fontSizePx : it.w));
        maxY = Math.max(maxY, it.y + fontSizePx);
      }
      const bx = minX - 4, by = minY - 4, bw = (maxX - minX) + 8, bh = (maxY - minY) + 8;
      ctx.save();
      ctx.strokeStyle = 'rgba(228,118,138,0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
      const hlCorners = [
        { x: bx, y: by }, { x: bx + bw, y: by },
        { x: bx, y: by + bh }, { x: bx + bw, y: by + bh },
      ];
      drawCornerHandles(ctx, hlCorners, '#E4768A');
      state._hlHandles = { corners: hlCorners, anchor: { x: textX, y: textY } };
    }

    // Subtitle (\n = 2+ lines/columns)
    state._subHandles = null;
    if (ts.showSubtitle && ts.subtitle) {
      const subFrameCfg = frame?.config?.subtitle || {};
      const subX  = ts.subX * S;
      const subY  = ts.subY * S;
      const subSz = (ts.subFontSize ?? subFrameCfg.fontSize ?? 22) * S;
      const subFamily = fontFamilyCSS(ts.subtitleFontFamily || 'Inter');
      const subLS = (ts.subLetterSpacing || 0) * S;
      const subLineSpacingPct = ts.subLineSpacing ?? 140;
      ctx.save();
      ctx.fillStyle = ts.subColor || subFrameCfg.color || '#2a2a2a';
      ctx.font = `${ts.subtitleFontWeight || '400'} ${subSz}px ${subFamily}`;
      const subDims = renderSubtitleLines(ctx, ts.subtitle, subX, subY, subSz, subLS, (subFrameCfg.letterSpacing ?? 3) * S, subLineSpacingPct, ts.subtitleVertical, true);
      ctx.restore();
      state._subDims = subDims;

      // Subtitle drag indicator (green dashed) — full multi-line bounding box
      const sbx = subX + subDims.offsetX - 2, sby = subY + subDims.offsetY - 2;
      const sbw = subDims.width + 4, sbh = subDims.height + 4;
      ctx.save();
      ctx.strokeStyle = 'rgba(68,187,136,0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(sbx, sby, sbw, sbh);
      ctx.restore();
      const subCorners = [
        { x: sbx, y: sby }, { x: sbx + sbw, y: sby },
        { x: sbx, y: sby + sbh }, { x: sbx + sbw, y: sby + sbh },
      ];
      drawCornerHandles(ctx, subCorners, '#44BB88');
      state._subHandles = { corners: subCorners, anchor: { x: subX, y: subY } };
    } else {
      state._subDims = null;
    }

    // ── Custom text boxes ──
    // Uses the identical layout/draw helpers as the headline above, so letter
    // spacing, line spacing, per-char kerning, white background and vertical
    // 縦組み punctuation all behave exactly the same.
    state._textLayouts = {};
    state._ctHandles = null;
    for (const t of (activePhoto.texts || [])) {
      if (!t.text) continue;
      const famT = fontFamilyCSS(t.fontFamily);
      const fsT = t.fontSize * S;
      const tX = t.x * S, tY = t.y * S;
      const lsT = (t.letterSpacing || 0) * S;
      const lsPctT = t.lineSpacing ?? 115;
      const kernsT = Object.fromEntries(
        Object.entries(t.charKerns || {}).map(([k, v]) => [k, v * S])
      );
      ctx.font = `${t.fontWeight} ${fsT}px ${famT}`;
      const layoutT = t.vertical
        ? layoutHeadlineV(ctx, t.text, tX, tY, fsT + lsT, fsT * (lsPctT / 100), fsT, kernsT).layout
        : layoutHeadlineH(ctx, t.text, tX, tY, t.maxWidth * S, fsT * (lsPctT / 100), lsT, kernsT).layout;
      state._textLayouts[t.id] = { layout: layoutT, fontSizePx: fsT };
      if (!layoutT.length) continue;

      const isSel = t.id === state.selectedTextId;

      if (t.whiteBg) {
        const padT = (t.whiteBgPad ?? 16) * S;
        const trimsT = Object.fromEntries(
          Object.entries(t.whiteBgEndTrims || {}).map(([k, v]) => [k, v * S])
        );
        drawTextBgFromLayout(ctx, layoutT, t.whiteBgColor, padT, fsT, trimsT);
        const rectsT = getTextBgRects(layoutT, padT, fsT, trimsT);
        state._bgRects.push(...rectsT.map(r => ({ ...r, ownerId: t.id })));
        if (isSel) {
          ctx.save();
          ctx.fillStyle = '#E0A83A';
          const hs = 10;
          for (const r of rectsT) {
            if (r.vertical) {
              const hx = r.x + r.w / 2, hy = r.y + r.h;
              ctx.beginPath(); ctx.moveTo(hx - hs, hy); ctx.lineTo(hx + hs, hy); ctx.lineTo(hx, hy + hs); ctx.closePath(); ctx.fill();
            } else {
              const hx = r.x + r.w, hy = r.y + r.h / 2;
              ctx.beginPath(); ctx.moveTo(hx, hy - hs); ctx.lineTo(hx, hy + hs); ctx.lineTo(hx + hs, hy); ctx.closePath(); ctx.fill();
            }
          }
          ctx.restore();
        }
      }

      ctx.save();
      ctx.fillStyle = t.color;
      ctx.textBaseline = 'top';
      drawCharLayout(ctx, layoutT, fsT);
      ctx.restore();

      drawKernCursor(ctx, layoutT, fsT, lsT, kernsT, t.id);

      if (isSel) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const it of layoutT) {
          minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
          maxX = Math.max(maxX, it.x + (it.vertical ? fsT : it.w));
          maxY = Math.max(maxY, it.y + fsT);
        }
        const bx = minX - 4, by = minY - 4, bw = (maxX - minX) + 8, bh = (maxY - minY) + 8;
        ctx.save();
        ctx.strokeStyle = 'rgba(108,142,227,0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();
        const ctCorners = [
          { x: bx, y: by }, { x: bx + bw, y: by },
          { x: bx, y: by + bh }, { x: bx + bw, y: by + bh },
        ];
        drawCornerHandles(ctx, ctCorners, '#6C8EE3');
        state._ctHandles = { corners: ctCorners, anchor: { x: tX, y: tY }, textId: t.id };
      }
    }

    // Placed icons (drawn on top of everything)
    state._iconHandles = null;
    for (const icon of activePhoto.icons) {
      const iconImg = await cachedImg(icon.src);
      const dims = drawPlacedIcon(ctx, iconImg, icon, S);
      // Selection indicator (orange dashed) for the active icon
      if (icon.id === state.selectedIconId) {
        const icx = icon.x * S, icy = icon.y * S;
        const rotRad = (icon.rotation || 0) * Math.PI / 180;
        ctx.save();
        ctx.translate(icx, icy);
        ctx.rotate(rotRad);
        ctx.strokeStyle = 'rgba(224,168,58,0.95)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(-dims.w / 2 - 2, -dims.h / 2 - 2, dims.w + 4, dims.h + 4);
        ctx.restore();
        // Rotate the 4 local corners into world space for handle drawing/hit-testing
        const hw = dims.w / 2 + 2, hh = dims.h / 2 + 2;
        const local = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: -hw, y: hh }, { x: hw, y: hh }];
        const iconCorners = local.map(p => ({
          x: icx + p.x * Math.cos(rotRad) - p.y * Math.sin(rotRad),
          y: icy + p.x * Math.sin(rotRad) + p.y * Math.cos(rotRad),
        }));
        drawCornerHandles(ctx, iconCorners, '#E0A83A');
        state._iconHandles = { corners: iconCorners, anchor: { x: icx, y: icy }, iconId: icon.id };
      }
    }
  } catch (err) {
    console.error('preview error', err);
  }
}

/* ── Draw small square resize handles at given canvas-space corner points ── */
function drawCornerHandles(ctx, corners, color) {
  const hs = 5; // half-size of the square in px
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (const c of corners) {
    ctx.fillRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
    ctx.strokeRect(c.x - hs, c.y - hs, hs * 2, hs * 2);
  }
  ctx.restore();
}

/* ── Hit-test a set of corner handles; returns the matched corner or null ── */
function hitTestHandles(corners, cx, cy, tol = 9) {
  for (const c of corners) {
    if (Math.abs(cx - c.x) <= tol && Math.abs(cy - c.y) <= tol) return c;
  }
  return null;
}

/* ── Hit-test a placed icon (accounts for rotation) ── */
function iconHitTest(icon, cx, cy, S) {
  const img = imgCache.get(icon.src);
  const aspect = icon.aspect || (img ? img.height / img.width : 1);
  const w = ICON_BASE_W * S * icon.scale;
  const h = w * aspect;
  const dx = cx - icon.x * S;
  const dy = cy - icon.y * S;
  const ang = -(icon.rotation || 0) * Math.PI / 180;
  const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
  const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
  return lx >= -w / 2 - 4 && lx <= w / 2 + 4 && ly >= -h / 2 - 4 && ly <= h / 2 + 4;
}

/* ── Draw a placed icon; returns its on-canvas {w,h} ── */
function drawPlacedIcon(ctx, iconImg, icon, S) {
  const aspect = icon.aspect || (iconImg.height / iconImg.width);
  const w = ICON_BASE_W * S * icon.scale;
  const h = w * aspect;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, (icon.opacity ?? 100) / 100));
  ctx.translate(icon.x * S, icon.y * S);
  ctx.rotate((icon.rotation || 0) * Math.PI / 180);
  ctx.drawImage(iconImg, -w / 2, -h / 2, w, h);
  ctx.restore();
  return { w, h };
}

/* ── Split text respecting explicit \n, then wrap at maxWidth ── */
function computeWrappedLines(ctx, text, maxWidth) {
  const result = [];
  for (const para of text.split('\n')) {
    if (!para) { result.push(''); continue; }
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        result.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    result.push(line);
  }
  return result;
}

function estimateLines(ctx, text, font, maxW) {
  ctx.font = font;
  return computeWrappedLines(ctx, text, maxW).length;
}

/* ════════════════════════════════════════
   Unified text layout (horizontal + vertical)
   ── kerning is keyed by origIdx: the index of a character in the
      ORIGINAL [...headline] sequence (\n counts as one slot). The kern
      value charKerns[origIdx] is extra advance applied AFTER that char.
      This keeps cursor placement, arrow-key adjustment, and drawing in
      perfect sync regardless of word-wrapping.
   ════════════════════════════════════════ */

// Wrap into lines, tracking each line's starting index in [...text]
function computeWrappedLinesOrig(ctx, text, maxWidth) {
  const result = [];
  const paras = text.split('\n');
  let origBase = 0;
  for (let pi = 0; pi < paras.length; pi++) {
    const chars = [...paras[pi]];
    if (chars.length === 0) {
      result.push({ chars: [], origStart: origBase });
    } else {
      let cur = [];
      let curStart = origBase;
      for (let k = 0; k < chars.length; k++) {
        const ch = chars[k];
        if (ctx.measureText(cur.join('') + ch).width > maxWidth && cur.length) {
          result.push({ chars: cur, origStart: curStart });
          cur = [ch];
          curStart = origBase + k;
        } else {
          cur.push(ch);
        }
      }
      result.push({ chars: cur, origStart: curStart });
    }
    origBase += chars.length + 1; // +1 for the \n / virtual separator
  }
  return result;
}

// Horizontal: per-char layout. letterSpacing/charKerns in same px units.
function layoutHeadlineH(ctx, text, x, y, maxWidth, lineHeight, letterSpacing, charKerns) {
  const lines = computeWrappedLinesOrig(ctx, text, maxWidth);
  const layout = [];
  lines.forEach((line, li) => {
    const ly = y + li * lineHeight;
    let cx = x;
    line.chars.forEach((ch, j) => {
      const origIdx = line.origStart + j;
      const w = ctx.measureText(ch).width;
      layout.push({ char: ch, x: cx, y: ly, w, origIdx, lineIdx: li, vertical: false });
      cx += w + letterSpacing + (charKerns[origIdx] || 0);
    });
  });
  return { layout, lineCount: lines.length };
}

// Vertical: columns go right→left; chars stack downward.
// charAdvance = distance between stacked chars (文字間); colStep = distance between columns (行間).
function layoutHeadlineV(ctx, text, x, y, charAdvance, colStep, fontSize, charKerns) {
  const cols = text.split('\n');
  const layout = [];
  let origBase = 0;
  cols.forEach((col, ci) => {
    const colX = x - ci * colStep;
    let curY = y;
    const chars = [...col];
    chars.forEach((ch, j) => {
      const origIdx = origBase + j;
      layout.push({ char: ch, x: colX, y: curY, w: fontSize, h: charAdvance, origIdx, lineIdx: ci, vertical: true });
      curY += charAdvance + (charKerns[origIdx] || 0);
    });
    origBase += chars.length + 1;
  });
  return { layout, colCount: cols.length };
}

// Arch: characters follow a circular arc, each rotated to stay perpendicular to the
// circle (classic "text on a path" look, like a logo badge). `radius` is signed —
// positive arches upward (text bulges up, like a smile/rainbow), negative arches
// downward (bulges down, like a frown). (cx, cy) is the arc's centre — for an upward
// arch the text sits ABOVE that point at distance |radius|; multi-line text (\n) stacks
// onto concentric arcs, each `lineHeight` further from the centre.
function layoutHeadlineArc(ctx, text, cx, cy, radius, letterSpacing, lineHeight, charKerns) {
  const layout = [];
  const lines = text.split('\n');
  let origBase = 0;
  const flip = radius < 0;
  lines.forEach((line, li) => {
    const r = Math.max(50, Math.abs(radius) + li * lineHeight);
    const chars = [...line];
    const widths = chars.map((ch, j) => ctx.measureText(ch).width + letterSpacing + (charKerns[origBase + j] || 0));
    const totalAngle = widths.reduce((a, w) => a + w, 0) / r;
    let angle = -totalAngle / 2;
    chars.forEach((ch, j) => {
      const w = widths[j];
      const half = (w / r) / 2;
      const theta = angle + half;
      const x = cx + r * Math.sin(theta);
      const y = flip ? cy + r * Math.cos(theta) : cy - r * Math.cos(theta);
      const rotation = flip ? theta + Math.PI : theta;
      layout.push({ char: ch, x, y, w, vertical: false, rotation, origIdx: origBase + j, lineIdx: li });
      angle += w / r;
    });
    origBase += chars.length + 1;
  });
  return { layout, lineCount: lines.length };
}

// Draw all chars from a layout (handles vertical punctuation orientation and arched
// rotation). Arched chars are drawn centred on (x,y) — the point on the arc — then
// rotated locally, rather than using (x,y) as a top-left corner like horizontal text.
function drawCharLayout(ctx, layout, fontSize) {
  for (const it of layout) {
    if (it.rotation) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rotation);
      const prevAlign = ctx.textAlign;
      ctx.textAlign = 'center';
      ctx.fillText(it.char, 0, 0);
      ctx.textAlign = prevAlign;
      ctx.restore();
    } else if (it.vertical) {
      drawVerticalChar(ctx, it.char, it.x, it.y, fontSize);
    } else {
      ctx.fillText(it.char, it.x, it.y);
    }
  }
}

// Draws (or just measures, when draw=false) a subtitle that may contain \n for 2+ lines.
// Horizontal: lines stack top-to-bottom. Vertical: each line becomes its own 90°-rotated
// column, offset by colStep so multiple lines/columns run in parallel.
// ctx.font / ctx.fillStyle / ctx.textBaseline should already be set by the caller.
// Returns the bounding {width, height} relative to (subX, subY), in caller's units.
function renderSubtitleLines(ctx, text, subX, subY, subSz, subLS, charGap, lineSpacingPct, vertical, draw) {
  const lines = text.split('\n');
  const colStep = subSz * (lineSpacingPct / 100);
  if (vertical) {
    let maxLineLen = 0;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.translate(subX + subSz, subY);
    ctx.rotate(Math.PI / 2);
    lines.forEach((line, li) => {
      let rx = 0;
      for (const ch of [...line].slice(0, 50)) {
        if (draw) ctx.fillText(ch, rx, li * colStep);
        rx += ctx.measureText(ch).width + charGap + subLS;
      }
      maxLineLen = Math.max(maxLineLen, rx);
    });
    ctx.restore();
    const width = subSz + (lines.length - 1) * colStep;
    return { width, height: maxLineLen, offsetX: subSz * 0.5 - (lines.length - 1) * colStep, offsetY: 0 };
  }
  let maxWidth = 0;
  ctx.textBaseline = 'top';
  lines.forEach((line, li) => {
    const ly = subY + li * colStep;
    if (!subLS) {
      if (draw) ctx.fillText(line, subX, ly);
      maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
    } else {
      let cx = subX;
      for (const ch of [...line]) {
        if (draw) ctx.fillText(ch, cx, ly);
        cx += ctx.measureText(ch).width + subLS;
      }
      maxWidth = Math.max(maxWidth, cx - subX);
    }
  });
  return { width: maxWidth, height: subSz + (lines.length - 1) * colStep, offsetX: 0, offsetY: 0 };
}

// Resolve per-line trim: endTrims can be {lineIdx→px} object OR a single number.
function getTrim(endTrims, lineIdx) {
  if (!endTrims) return 0;
  if (typeof endTrims === 'object') return endTrims[lineIdx] ?? 0;
  return endTrims || 0;
}

// White background, grouped per line (horizontal) or column (vertical).
// endTrims: {lineIdx: px} per-column or single number for all.
function drawTextBgFromLayout(ctx, layout, color, pad, fontSizePx, endTrims) {
  const groups = {};
  for (const it of layout) (groups[it.lineIdx] ||= []).push(it);
  ctx.fillStyle = color;
  for (const k in groups) {
    const li = +k, g = groups[k];
    if (!g.length) continue;
    const trim = getTrim(endTrims, li);
    if (g[0].vertical) {
      const colX = g[0].x, minY = g[0].y, lastY = g[g.length - 1].y;
      const height = Math.max(fontSizePx * 0.2, (lastY - minY) + fontSizePx - trim);
      ctx.fillRect(colX - pad, minY - pad, fontSizePx + pad * 2, height + pad * 2);
    } else {
      const minX = g[0].x, last = g[g.length - 1];
      const width = Math.max(fontSizePx * 0.2, (last.x + last.w) - minX - trim);
      ctx.fillRect(minX - pad, g[0].y - pad, width + pad * 2, fontSizePx + pad * 2);
    }
  }
}

// Returns bounding rects of the white bg columns/lines (with lineIdx for per-line drag)
function getTextBgRects(layout, pad, fontSizePx, endTrims) {
  const groups = {};
  for (const it of layout) (groups[it.lineIdx] ||= []).push(it);
  return Object.entries(groups).filter(([,g]) => g.length).map(([k, g]) => {
    const li = +k;
    const trim = getTrim(endTrims, li);
    if (g[0].vertical) {
      const colX = g[0].x, minY = g[0].y, lastY = g[g.length - 1].y;
      const height = Math.max(fontSizePx * 0.2, (lastY - minY) + fontSizePx - trim);
      return { x: colX - pad, y: minY - pad, w: fontSizePx + pad * 2, h: height + pad * 2, vertical: true, lineIdx: li };
    } else {
      const minX = g[0].x, last = g[g.length - 1];
      const width = Math.max(fontSizePx * 0.2, (last.x + last.w) - minX - trim);
      return { x: minX - pad, y: g[0].y - pad, w: width + pad * 2, h: fontSizePx + pad * 2, vertical: false, lineIdx: li };
    }
  });
}

/* ── Vertical Japanese punctuation ──
   Cell origin (x,y) = top-left; centre = (x+fs/2, y+fs/2). Drawn with
   centre alignment so glyphs land in the correct quadrant. */
const VERT_ROTATE = new Set([...'ー—–〜～…‥（）「」『』【】〔〕〈〉《》〘〙｛｝()[]{}｜|ｰｸ']);
const VERT_SHIFT_TR = new Set([...'、。，．,.']);          // small punct → top-right
const VERT_SMALL = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ']); // small kana → up-right a touch

function drawVerticalChar(ctx, char, x, y, fontSize) {
  const cx = x + fontSize / 2;
  const cy = y + fontSize / 2;
  const prevAlign = ctx.textAlign, prevBase = ctx.textBaseline;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (VERT_ROTATE.has(char)) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(char, 0, 0);
    ctx.restore();
  } else if (VERT_SHIFT_TR.has(char)) {
    // 「、」「。」のインクはhorizontal em枠の左下（左:0〜25%, 下:70〜95%）に存在。
    // 縦書きでは右上（右:65〜90%, 上:2〜28%）に配置するため
    // textBaseline='top'/textAlign='left' に切り替えてアンカーをずらす。
    // draw_x = cell_x + 0.62em で左辺を65%付近へ
    // draw_y = cell_y - 0.68em でインク上辺(y+0.70em)を cell_y+0.02em 付近へ
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(char, x + fontSize * 0.62, y - fontSize * 0.68);
  } else if (VERT_SMALL.has(char)) {
    ctx.fillText(char, cx + fontSize * 0.10, cy - fontSize * 0.10);
  } else {
    ctx.fillText(char, cx, cy);
  }
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBase;
}

// Draw the orange kern-cursor indicator at the gap after origIdx === state.kernCursor.
// `ownerId` identifies which text this layout belongs to (null = headline); the cursor
// is only drawn on the text it actually points at.
function drawKernCursor(ctx, layout, fontSizePx, letterSpacing, charKernsScaled, ownerId = null) {
  if (state.kernCursor === null || state.kernCursor === undefined) return;
  if ((state.kernTargetId || null) !== ownerId) return;
  const it = layout.find(l => l.origIdx === state.kernCursor);
  if (!it) return;
  ctx.save();
  ctx.strokeStyle = '#E0A83A';
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  const kern = charKernsScaled[it.origIdx] || 0;
  if (it.vertical) {
    const gy = it.y + fontSizePx + (letterSpacing + kern) * 0.5;
    ctx.moveTo(it.x - 2, gy);
    ctx.lineTo(it.x + fontSizePx + 2, gy);
  } else {
    const gx = it.x + it.w + (letterSpacing + kern) * 0.5;
    ctx.moveTo(gx, it.y - 2);
    ctx.lineTo(gx, it.y + fontSizePx + 2);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Canvas drag to reposition text (headline + subtitle) and photo ──
let dragState = null;

editPreviewCanvas.addEventListener('mousedown', e => {
  const rect = editPreviewCanvas.getBoundingClientRect();
  const cW = editPreviewCanvas.width;
  const cH = editPreviewCanvas.height;
  const S  = cW / 1080;
  const cx = (e.clientX - rect.left) * (cW / rect.width);
  const cy = (e.clientY - rect.top)  * (cH / rect.height);

  // White-bg drag handle hit-test (yellow triangle at trailing edge).
  // Rects carry ownerId so the handle edits the right text (null = headline).
  if (state._bgRects?.length) {
    const hs = 14;
    for (const r of state._bgRects) {
      const owner = r.ownerId ? activeTexts().find(t => t.id === r.ownerId) : state.textStyle;
      if (!owner?.whiteBg) continue;
      const hx = r.vertical ? r.x + r.w / 2 : r.x + r.w;
      const hy = r.vertical ? r.y + r.h      : r.y + r.h / 2;
      if (Math.abs(cx - hx) <= hs && Math.abs(cy - hy) <= hs) {
        dragState = {
          target: 'whiteBgHandle',
          ownerId: r.ownerId || null,
          lineIdx: r.lineIdx,
          startTrim: (owner.whiteBgEndTrims || {})[r.lineIdx] || 0,
          startCx: cx, startCy: cy, S,
          vertical: r.vertical,
        };
        editPreviewCanvas.style.cursor = 'ns-resize';
        e.preventDefault();
        return;
      }
    }
  }

  // Selected custom text's corner resize handles
  if (state._ctHandles) {
    const hit = hitTestHandles(state._ctHandles.corners, cx, cy);
    if (hit) {
      const t = activeTexts().find(x => x.id === state._ctHandles.textId);
      if (t) {
        const { anchor } = state._ctHandles;
        dragState = {
          target: 'resize', which: 'customText', textId: t.id,
          anchorX: anchor.x, anchorY: anchor.y,
          startDist: Math.hypot(hit.x - anchor.x, hit.y - anchor.y),
          startSize: t.fontSize,
        };
        editPreviewCanvas.style.cursor = 'nwse-resize';
        e.preventDefault();
        return;
      }
    }
  }

  // Corner-handle resize hit-tests — highest priority after white-bg trim handle.
  // Icon handles (only the selected icon shows them) take priority since they sit on top.
  if (state._iconHandles) {
    const hit = hitTestHandles(state._iconHandles.corners, cx, cy);
    if (hit) {
      const activeP = state.photos[state.previewPhotoIdx];
      const icon = activeP?.icons.find(ic => ic.id === state._iconHandles.iconId);
      if (icon) {
        const { anchor } = state._iconHandles;
        dragState = {
          target: 'resize', which: 'icon', iconId: icon.id,
          anchorX: anchor.x, anchorY: anchor.y,
          startDist: Math.hypot(hit.x - anchor.x, hit.y - anchor.y),
          startSize: icon.scale,
        };
        editPreviewCanvas.style.cursor = 'nwse-resize';
        e.preventDefault();
        return;
      }
    }
  }
  if (state._hlHandles) {
    const hit = hitTestHandles(state._hlHandles.corners, cx, cy);
    if (hit) {
      const { anchor } = state._hlHandles;
      dragState = {
        target: 'resize', which: 'headline',
        anchorX: anchor.x, anchorY: anchor.y,
        startDist: Math.hypot(hit.x - anchor.x, hit.y - anchor.y),
        startSize: state.textStyle.fontSize,
      };
      editPreviewCanvas.style.cursor = 'nwse-resize';
      e.preventDefault();
      return;
    }
  }
  if (state._subHandles) {
    const hit = hitTestHandles(state._subHandles.corners, cx, cy);
    if (hit) {
      const { anchor } = state._subHandles;
      dragState = {
        target: 'resize', which: 'subtitle',
        anchorX: anchor.x, anchorY: anchor.y,
        startDist: Math.hypot(hit.x - anchor.x, hit.y - anchor.y),
        startSize: state.textStyle.subFontSize ?? 22,
      };
      editPreviewCanvas.style.cursor = 'nwse-resize';
      e.preventDefault();
      return;
    }
  }

  // Option+click → place kern cursor at the gap AFTER the nearest char.
  // Works for both horizontal and vertical; stores the char's origIdx so
  // drawing/arrow-adjustment stay perfectly in sync (no off-by-one).
  // Searches the headline AND every custom text box, so kerning works the same
  // way on all of them; the nearest gap across all texts wins.
  if (e.altKey) {
    const candidates = [];
    if (state.textStyle && state._hlLayout?.length) {
      candidates.push({
        ownerId: null,
        layout: state._hlLayout,
        fsPx: state._fontSizePx || (state.textStyle.fontSize * S),
      });
    }
    for (const [id, cached] of Object.entries(state._textLayouts || {})) {
      if (cached.layout?.length) candidates.push({ ownerId: id, layout: cached.layout, fsPx: cached.fontSizePx });
    }
    let best = null, bestOwner = null, bestDist = Infinity;
    for (const c of candidates) {
      for (const it of c.layout) {
        // gap point sits just after this char (right edge / bottom edge)
        const gx = it.vertical ? it.x + c.fsPx / 2 : it.x + it.w;
        const gy = it.vertical ? it.y + c.fsPx     : it.y + c.fsPx / 2;
        const dist = Math.hypot(gx - cx, gy - cy);
        if (dist < bestDist) { bestDist = dist; best = it; bestOwner = c.ownerId; }
      }
    }
    if (best) {
      state.kernCursor = best.origIdx;
      state.kernTargetId = bestOwner;
      if (bestOwner && state.selectedTextId !== bestOwner) {
        state.selectedTextId = bestOwner;
        renderCtList();
        renderCtSettings();
      }
      schedulePreviewRedraw();
      e.preventDefault();
      return;
    }
  }

  // Placed icons — highest priority (drawn on top); topmost first
  const activeP = state.photos[state.previewPhotoIdx];
  if (activeP && activeP.icons.length) {
    for (let i = activeP.icons.length - 1; i >= 0; i--) {
      const icon = activeP.icons[i];
      if (iconHitTest(icon, cx, cy, S)) {
        selectIcon(icon.id);
        dragState = { target: 'icon', iconId: icon.id, startX: icon.x, startY: icon.y, startCx: cx, startCy: cy, S };
        editPreviewCanvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }
  }

  // Regular click clears kern cursor
  state.kernCursor = null;

  // Custom text boxes — topmost (most recently added) first, above the
  // headline/subtitle so a newly-placed text is always grabbable.
  const texts = activeTexts();
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    const cached = state._textLayouts?.[t.id];
    if (!cached?.layout?.length) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of cached.layout) {
      minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + (it.vertical ? cached.fontSizePx : it.w));
      maxY = Math.max(maxY, it.y + cached.fontSizePx);
    }
    if (cx >= minX - 10 && cx <= maxX + 10 && cy >= minY - 10 && cy <= maxY + 10) {
      if (state.selectedTextId !== t.id) {
        state.selectedTextId = t.id;
        renderCtList();
        renderCtSettings();
      }
      dragState = { target: 'customText', textId: t.id, offX: cx - t.x * S, offY: cy - t.y * S };
      editPreviewCanvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
  }

  if (state.textStyle) {
    const ts = state.textStyle;

    // Subtitle hit box (green) — checked first, from actual multi-line bounding box
    const subX = ts.subX * S;
    const subY = ts.subY * S;
    const sd = state._subDims;
    if (sd) {
      const hx = subX + sd.offsetX, hy = subY + sd.offsetY;
      if (cx >= hx - 8 && cx <= hx + sd.width + 8 && cy >= hy - 8 && cy <= hy + sd.height + 8) {
        dragState = { target: 'subtitle', offX: cx - subX, offY: cy - subY };
        editPreviewCanvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }

    // Headline hit box (pink) — derived from actual layout bounds
    const tx = ts.x * S;
    const ty = ts.y * S;
    const layout = state._hlLayout;
    const fsPx = state._fontSizePx || (ts.fontSize * S);
    if (layout && layout.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const it of layout) {
        minX = Math.min(minX, it.x); minY = Math.min(minY, it.y);
        maxX = Math.max(maxX, it.x + (it.vertical ? fsPx : it.w));
        maxY = Math.max(maxY, it.y + fsPx);
      }
      if (cx >= minX - 10 && cx <= maxX + 10 && cy >= minY - 10 && cy <= maxY + 10) {
        dragState = { target: 'headline', offX: cx - tx, offY: cy - ty };
        editPreviewCanvas.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
    }
  }

  // Fallback: drag photo
  const activePhoto = state.photos[state.previewPhotoIdx];
  if (activePhoto) {
    dragState = {
      target: 'photo',
      startPhotoX: activePhoto.offset.x,
      startPhotoY: activePhoto.offset.y,
      startCx: cx,
      startCy: cy,
    };
    editPreviewCanvas.style.cursor = 'grabbing';
    e.preventDefault();
  }
});

editPreviewCanvas.addEventListener('mousemove', e => {
  const rect = editPreviewCanvas.getBoundingClientRect();
  const cW = editPreviewCanvas.width;
  const cH = editPreviewCanvas.height;
  const S  = cW / 1080;
  const cx = (e.clientX - rect.left) * (cW / rect.width);
  const cy = (e.clientY - rect.top)  * (cH / rect.height);

  if (!dragState) {
    if (!state.photos.length) return;
    let onText = false;
    const hoverP = state.photos[state.previewPhotoIdx];
    if (hoverP && hoverP.icons.some(ic => iconHitTest(ic, cx, cy, S))) {
      editPreviewCanvas.style.cursor = 'move';
      return;
    }
    if (state.textStyle) {
      const ts = state.textStyle;
      const fsPx = state._fontSizePx || (ts.fontSize * S);
      const layout = state._hlLayout;
      if (layout && layout.length) {
        for (const it of layout) {
          const ix2 = it.x + (it.vertical ? fsPx : it.w);
          const iy2 = it.y + fsPx;
          if (cx >= it.x - 6 && cx <= ix2 + 6 && cy >= it.y - 6 && cy <= iy2 + 6) { onText = true; break; }
        }
      }
      const subX = ts.subX * S, subY = ts.subY * S;
      const sd = state._subDims;
      if (sd) {
        const hx = subX + sd.offsetX, hy = subY + sd.offsetY;
        if (cx >= hx - 8 && cx <= hx + sd.width + 8 && cy >= hy - 8 && cy <= hy + sd.height + 8) {
          onText = true;
        }
      }
    }
    editPreviewCanvas.style.cursor = onText ? 'move' : 'grab';
    return;
  }

  const activePhoto = state.photos[state.previewPhotoIdx];
  if (dragState.target === 'resize') {
    const newDist = Math.hypot(cx - dragState.anchorX, cy - dragState.anchorY);
    const factor = dragState.startDist > 0 ? newDist / dragState.startDist : 1;
    if (dragState.which === 'headline' && state.textStyle) {
      const ts = state.textStyle;
      ts.fontSize = Math.round(Math.max(20, Math.min(200, dragState.startSize * factor)));
      document.getElementById('ctrlSize').value = ts.fontSize;
      document.getElementById('ctrlSizeVal').textContent = ts.fontSize;
    } else if (dragState.which === 'subtitle' && state.textStyle) {
      const ts = state.textStyle;
      ts.subFontSize = Math.round(Math.max(10, Math.min(80, dragState.startSize * factor)));
      document.getElementById('ctrlSubSize').value = ts.subFontSize;
      document.getElementById('ctrlSubSizeVal').textContent = ts.subFontSize;
    } else if (dragState.which === 'customText') {
      const t = activeTexts().find(x => x.id === dragState.textId);
      if (t) {
        t.fontSize = Math.round(Math.max(10, Math.min(200, dragState.startSize * factor)));
        document.getElementById('ctSize').value = t.fontSize;
        document.getElementById('ctSizeVal').textContent = t.fontSize;
      }
    } else if (dragState.which === 'icon' && activePhoto) {
      const icon = activePhoto.icons.find(ic => ic.id === dragState.iconId);
      if (icon) {
        icon.scale = Math.round(Math.max(10, Math.min(400, dragState.startSize * factor * 100))) / 100;
        if (icon.id === state.selectedIconId) {
          const pct = Math.round(icon.scale * 100);
          document.getElementById('iconScale').value = pct;
          document.getElementById('iconScaleVal').textContent = pct + '%';
        }
      }
    }
  } else if (dragState.target === 'icon' && activePhoto) {
    const icon = activePhoto.icons.find(ic => ic.id === dragState.iconId);
    if (icon) {
      icon.x = Math.round(Math.max(0, Math.min(1080, dragState.startX + (cx - dragState.startCx) / S)));
      icon.y = Math.round(Math.max(0, Math.min(1350, dragState.startY + (cy - dragState.startCy) / S)));
      if (icon.id === state.selectedIconId) {
        document.getElementById('iconX').value = icon.x;
        document.getElementById('iconXVal').textContent = icon.x;
        document.getElementById('iconY').value = icon.y;
        document.getElementById('iconYVal').textContent = icon.y;
      }
    }
  } else if (dragState.target === 'whiteBgHandle') {
    const owner = dragState.ownerId
      ? activeTexts().find(t => t.id === dragState.ownerId)
      : state.textStyle;
    if (owner) {
      const delta = dragState.vertical
        ? -(cy - dragState.startCy) / dragState.S
        : -(cx - dragState.startCx) / dragState.S;
      const newTrim = Math.round(Math.max(-200, Math.min(800, dragState.startTrim - delta)));
      if (!owner.whiteBgEndTrims) owner.whiteBgEndTrims = {};
      owner.whiteBgEndTrims[dragState.lineIdx] = newTrim;
      // Sync matching slider in the dynamic UI (headline and custom text each
      // render their own slider set into a different container).
      const cls = dragState.ownerId ? 'ct-trim' : 'bg-trim';
      const sl = document.querySelector(`.${cls}-slider[data-li="${dragState.lineIdx}"]`);
      const vl = document.querySelector(`.${cls}-val[data-li="${dragState.lineIdx}"]`);
      if (sl) { sl.value = newTrim; if (vl) vl.textContent = newTrim; }
    }
  } else if (dragState.target === 'customText') {
    const t = activeTexts().find(x => x.id === dragState.textId);
    if (t) {
      t.x = Math.round(Math.max(0, Math.min(1000, (cx - dragState.offX) / S)));
      t.y = Math.round(Math.max(0, Math.min(1300, (cy - dragState.offY) / S)));
      document.getElementById('ctPosX').value = t.x;
      document.getElementById('ctPosXVal').textContent = t.x;
      document.getElementById('ctPosY').value = t.y;
      document.getElementById('ctPosYVal').textContent = t.y;
    }
  } else if (dragState.target === 'photo' && activePhoto) {
    activePhoto.offset.x = dragState.startPhotoX + (cx - dragState.startCx) / S;
    activePhoto.offset.y = dragState.startPhotoY + (cy - dragState.startCy) / S;
  } else if (dragState.target === 'subtitle' && state.textStyle) {
    const ts = state.textStyle;
    ts.subX = Math.round(Math.max(0, Math.min(1000, (cx - dragState.offX) / S)));
    ts.subY = Math.round(Math.max(0, Math.min(1300, (cy - dragState.offY) / S)));
    document.getElementById('ctrlSubX').value = ts.subX;
    document.getElementById('ctrlSubXVal').textContent = ts.subX;
    document.getElementById('ctrlSubY').value = ts.subY;
    document.getElementById('ctrlSubYVal').textContent = ts.subY;
  } else if (dragState.target === 'headline' && state.textStyle) {
    const ts = state.textStyle;
    ts.x = Math.round(Math.max(0, Math.min(1000, (cx - dragState.offX) / S)));
    ts.y = Math.round(Math.max(0, Math.min(1300, (cy - dragState.offY) / S)));
    document.getElementById('ctrlPosX').value = ts.x;
    document.getElementById('ctrlPosXVal').textContent = ts.x;
    document.getElementById('ctrlPosY').value = ts.y;
    document.getElementById('ctrlPosYVal').textContent = ts.y;
  }
  schedulePreviewRedraw();
});

function stopDrag() { dragState = null; editPreviewCanvas.style.cursor = 'grab'; }
editPreviewCanvas.addEventListener('mouseup', stopDrag);
editPreviewCanvas.addEventListener('mouseleave', stopDrag);

// ── Photo preview navigation (between photos) ──
function updatePreviewPhotoLabel() {
  const n = state.photos.length;
  if (n === 0) {
    previewFrameLabel.textContent = '0 / 0';
    btnPrevFrame.disabled = true;
    btnNextFrame.disabled = true;
    return;
  }
  previewFrameLabel.textContent = `${state.previewPhotoIdx + 1} / ${n}`;
  btnPrevFrame.disabled = state.previewPhotoIdx === 0;
  btnNextFrame.disabled = state.previewPhotoIdx >= n - 1;
}

btnPrevFrame.addEventListener('click', () => {
  if (state.previewPhotoIdx > 0) switchToPhoto(state.previewPhotoIdx - 1);
});
btnNextFrame.addEventListener('click', () => {
  if (state.previewPhotoIdx < state.photos.length - 1) switchToPhoto(state.previewPhotoIdx + 1);
});

// ── Text field changes ──
editHeadline.addEventListener('input', () => {
  if (state.textStyle) { state.textStyle.headline = editHeadline.value; schedulePreviewRedraw(); }
});
editSubtitle.addEventListener('input', () => {
  if (state.textStyle) { state.textStyle.subtitle = editSubtitle.value; schedulePreviewRedraw(); }
});

// ── Style controls ──
function bindSlider(sliderId, valId, key) {
  const slider = document.getElementById(sliderId);
  const valEl  = document.getElementById(valId);
  slider.addEventListener('input', () => {
    const v = +slider.value;
    valEl.textContent = v;
    if (state.textStyle) { state.textStyle[key] = v; schedulePreviewRedraw(); }
  });
}
bindSlider('ctrlSize', 'ctrlSizeVal', 'fontSize');
bindSlider('ctrlPosX', 'ctrlPosXVal', 'x');
bindSlider('ctrlPosY', 'ctrlPosYVal', 'y');
bindSlider('ctrlMaxW', 'ctrlMaxWVal', 'maxWidth');
bindSlider('ctrlSubX', 'ctrlSubXVal', 'subX');
bindSlider('ctrlSubY', 'ctrlSubYVal', 'subY');
bindSlider('ctrlSubSize', 'ctrlSubSizeVal', 'subFontSize');

document.getElementById('ctrlFont').addEventListener('change', e => {
  if (state.textStyle) { state.textStyle.fontFamily = e.target.value; schedulePreviewRedraw(); }
});
document.getElementById('ctrlFontWeight').addEventListener('change', e => {
  if (state.textStyle) { state.textStyle.fontWeight = e.target.value; schedulePreviewRedraw(); }
});
document.getElementById('ctrlSubFont').addEventListener('change', e => {
  if (state.textStyle) { state.textStyle.subtitleFontFamily = e.target.value; schedulePreviewRedraw(); }
});
document.getElementById('ctrlSubFontWeight').addEventListener('change', e => {
  if (state.textStyle) { state.textStyle.subtitleFontWeight = e.target.value; schedulePreviewRedraw(); }
});

syncColor('ctrlColor', 'ctrlColorText', () => {
  if (state.textStyle) { state.textStyle.color = document.getElementById('ctrlColor').value; schedulePreviewRedraw(); }
});

syncColor('ctrlSubColor', 'ctrlSubColorText', () => {
  if (state.textStyle) { state.textStyle.subColor = document.getElementById('ctrlSubColor').value; schedulePreviewRedraw(); }
});

document.getElementById('ctrlWhiteBg').addEventListener('change', e => {
  const on = e.target.checked;
  if (state.textStyle) { state.textStyle.whiteBg = on; }
  document.getElementById('ctrlBgColorRow').hidden = !on;
  schedulePreviewRedraw();
});

syncColor('ctrlBgColor', 'ctrlBgColorText', () => {
  if (state.textStyle) { state.textStyle.whiteBgColor = document.getElementById('ctrlBgColor').value; schedulePreviewRedraw(); }
});

// Per-line trim sliders use event delegation on the container
document.getElementById('ctrlBgEndRows').addEventListener('input', e => {
  if (!e.target.classList.contains('bg-trim-slider')) return;
  if (!state.textStyle) return;
  if (!state.textStyle.whiteBgEndTrims) state.textStyle.whiteBgEndTrims = {};
  const li = +e.target.dataset.li;
  const v = +e.target.value;
  state.textStyle.whiteBgEndTrims[li] = v;
  const vEl = document.querySelector(`.bg-trim-val[data-li="${li}"]`);
  if (vEl) vEl.textContent = v;
  schedulePreviewRedraw();
});

document.getElementById('ctrlShowSub').addEventListener('change', e => {
  if (state.textStyle) { state.textStyle.showSubtitle = e.target.checked; schedulePreviewRedraw(); }
});

// Headline orientation buttons — 横書き / 縦書き / アーチ (three-way; arc uses
// `arcRadius` rather than a boolean since its sign also carries up/down direction).
function setHeadlineOrientation(mode) {
  if (!state.textStyle) return;
  const ts = state.textStyle;
  document.getElementById('ctrlHlHoriz').classList.toggle('active', mode === 'horizontal');
  document.getElementById('ctrlHlVert').classList.toggle('active', mode === 'vertical');
  document.getElementById('ctrlHlArc').classList.toggle('active', mode === 'arc');
  document.getElementById('ctrlArcRadiusRow').hidden = mode !== 'arc';
  if (mode === 'arc') {
    ts.headlineVertical = false;
    if (!ts.arcRadius) {
      ts.arcRadius = 500;
      document.getElementById('ctrlArcRadius').value = 500;
      document.getElementById('ctrlArcRadiusVal').textContent = 500;
    }
  } else {
    ts.headlineVertical = mode === 'vertical';
    ts.arcRadius = 0;
  }
  schedulePreviewRedraw();
}
document.getElementById('ctrlHlHoriz').addEventListener('click', () => setHeadlineOrientation('horizontal'));
document.getElementById('ctrlHlVert').addEventListener('click', () => setHeadlineOrientation('vertical'));
document.getElementById('ctrlHlArc').addEventListener('click', () => setHeadlineOrientation('arc'));

document.getElementById('ctrlArcRadius').addEventListener('input', e => {
  if (!state.textStyle) return;
  state.textStyle.arcRadius = +e.target.value;
  document.getElementById('ctrlArcRadiusVal').textContent = e.target.value;
  schedulePreviewRedraw();
});

// Subtitle orientation buttons
document.getElementById('ctrlSubHoriz').addEventListener('click', () => {
  if (!state.textStyle) return;
  state.textStyle.subtitleVertical = false;
  document.getElementById('ctrlSubHoriz').classList.add('active');
  document.getElementById('ctrlSubVert').classList.remove('active');
  schedulePreviewRedraw();
});
document.getElementById('ctrlSubVert').addEventListener('click', () => {
  if (!state.textStyle) return;
  state.textStyle.subtitleVertical = true;
  document.getElementById('ctrlSubVert').classList.add('active');
  document.getElementById('ctrlSubHoriz').classList.remove('active');
  schedulePreviewRedraw();
});

// ── Caption tabs ──
let activeCaptionIdx = 0;
function fitCaptionBody() {
  captionBody.style.height = 'auto';
  captionBody.style.height = captionBody.scrollHeight + 'px';
}
function renderCaption(idx) {
  captionBody.value = state.generatedCopy?.captions?.[idx] || '';
  document.querySelectorAll('.cap-tab').forEach((tab, i) => tab.classList.toggle('active', i === idx));
  activeCaptionIdx = idx;
  requestAnimationFrame(fitCaptionBody);
}
// Edits replace the generated text, so copy, export and saved projects all use the corrected
// version. Regenerating overwrites them.
captionBody.addEventListener('input', () => {
  const captions = state.generatedCopy?.captions;
  if (captions) captions[activeCaptionIdx] = captionBody.value;
  fitCaptionBody();
});
captionTabs.addEventListener('click', e => {
  if (e.target.classList.contains('cap-tab')) renderCaption(+e.target.dataset.idx);
});
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older WebKit refuses the async API outside a direct tap; a selected textarea still copies.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
btnCopy.addEventListener('click', async () => {
  await copyText(captionWithHashtags(activeCaptionIdx));
  btnCopy.classList.add('copied');
  btnCopy.textContent = '✓ コピーしました';
  setTimeout(() => {
    btnCopy.classList.remove('copied');
    btnCopy.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>コピー`;
  }, 2000);
});

/* ════════════════════════════════════════
   Composite
   ════════════════════════════════════════ */
btnComposite.addEventListener('click', async () => {
  if (!state.photos.length) {
    showToast('写真がありません');
    return;
  }
  setOutput('loading');
  loadingMsg.textContent = '画像を合成中…';
  state.generatedImages = [];

  // A frame is optional — headline/subtitle/icons render regardless, the frame
  // overlay is simply skipped for photos where none is assigned.
  for (const photo of state.photos) {
    if (!photo.textStyle) continue;
    const frame = photo.frameId ? state.availableFrames.find(f => f.id === photo.frameId) : null;
    try {
      const dataUrl = await compositeImageFor(photo, frame);
      state.generatedImages.push({ dataUrl, frameName: frame ? frame.name : 'フレームなし' });
    } catch (err) {
      console.error('composite error', err);
    }
  }

  if (!state.generatedImages.length) {
    setOutput('editing');
    showToast('画像の生成に失敗しました', 3000);
    return;
  }
  renderResults();
  setOutput('results');
});

btnReEdit.addEventListener('click', () => setOutput('editing'));

/* ════════════════════════════════════════
   Canvas compositing (full resolution) — per photo
   ════════════════════════════════════════ */
async function compositeImageFor(photo, frame) {
  const cfg = frame?.config || {};
  const W   = cfg.canvasWidth  || 1080;
  const H   = cfg.canvasHeight || 1350;
  const ts  = photo.textStyle;
  if (!ts) return null;
  const activeHeadline = ts.headline;

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Background colour — visible once zoom shrinks the photo below the
  // frame-filling default (100%), revealing the canvas behind it.
  ctx.fillStyle = photo.bgColor || '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Photo with per-photo filter, offset, scale, rotation
  const photoImg = await loadImg(photo.url);
  const baseSc = Math.max(W / photoImg.width, H / photoImg.height);
  const sc = baseSc * photo.scale;
  const pw = photoImg.width * sc, ph = photoImg.height * sc;
  const pcx = W / 2 + photo.offset.x;
  const pcy = H / 2 + photo.offset.y;
  const rot = (photo.rotation || 0) * Math.PI / 180;
  const filterStr = buildFilterStringFor(photo);
  ctx.save();
  if (filterStr !== 'none') ctx.filter = filterStr;
  ctx.translate(pcx, pcy);
  ctx.rotate(rot);
  ctx.drawImage(photoImg, -pw / 2, -ph / 2, pw, ph);
  ctx.restore();

  // Frame overlay with per-photo hue/sat filter — headline/subtitle/icons
  // below are independent of this and still render without a frame.
  if (frame) {
    const overlay = await loadImg(frame.overlayUrl);
    const frameFilter = buildFrameFilterFor(photo);
    ctx.save();
    if (frameFilter !== 'none') ctx.filter = frameFilter;
    ctx.drawImage(overlay, 0, 0, W, H);
    ctx.restore();
  }

  await document.fonts.ready;

  const hlFamily = fontFamilyCSS(ts.fontFamily);
  const lineSpacingPct = ts.lineSpacing ?? 115;
  const lineH = ts.fontSize * (lineSpacingPct / 100);
  const letterSpacingPx = ts.letterSpacing || 0;
  const charKerns = ts.charKerns || {};
  const vCharAdvance = ts.fontSize + letterSpacingPx;
  const vColStep     = ts.fontSize * (lineSpacingPct / 100);

  ctx.font = `${ts.fontWeight} ${ts.fontSize}px ${hlFamily}`;

  // Build layout (full-resolution, S=1)
  const hlLayout = ts.arcRadius
    ? layoutHeadlineArc(ctx, activeHeadline, ts.x, ts.y, ts.arcRadius, letterSpacingPx, lineH, charKerns).layout
    : ts.headlineVertical
      ? layoutHeadlineV(ctx, activeHeadline, ts.x, ts.y, vCharAdvance, vColStep, ts.fontSize, charKerns).layout
      : layoutHeadlineH(ctx, activeHeadline, ts.x, ts.y, ts.maxWidth, lineH, letterSpacingPx, charKerns).layout;

  // White background — symmetric padding
  if (ts.whiteBg) {
    drawTextBgFromLayout(ctx, hlLayout, ts.whiteBgColor, ts.whiteBgPad, ts.fontSize, ts.whiteBgEndTrims || {});
  }

  // Headline text
  ctx.save();
  ctx.fillStyle = ts.color;
  ctx.textBaseline = 'top';
  drawCharLayout(ctx, hlLayout, ts.fontSize);
  ctx.restore();

  // Subtitle (\n = 2+ lines/columns)
  if (ts.showSubtitle && ts.subtitle) {
    const sub = cfg.subtitle || {};
    const subFamily = fontFamilyCSS(ts.subtitleFontFamily || 'Inter');
    const subLS = ts.subLetterSpacing || 0;
    const subSz = ts.subFontSize ?? sub.fontSize ?? 22;
    const subLineSpacingPct = ts.subLineSpacing ?? 140;
    ctx.save();
    ctx.fillStyle = ts.subColor || sub.color || '#333';
    ctx.font = `${ts.subtitleFontWeight || '400'} ${subSz}px ${subFamily}`;
    renderSubtitleLines(ctx, ts.subtitle, ts.subX, ts.subY, subSz, subLS, sub.letterSpacing ?? 3, subLineSpacingPct, ts.subtitleVertical, true);
    ctx.restore();
  }

  // Custom text boxes — same helpers as the headline above, at S=1
  for (const t of (photo.texts || [])) {
    if (!t.text) continue;
    const famT = fontFamilyCSS(t.fontFamily);
    const lsT = t.letterSpacing || 0;
    const lsPctT = t.lineSpacing ?? 115;
    const kernsT = t.charKerns || {};
    ctx.font = `${t.fontWeight} ${t.fontSize}px ${famT}`;
    const layoutT = t.vertical
      ? layoutHeadlineV(ctx, t.text, t.x, t.y, t.fontSize + lsT, t.fontSize * (lsPctT / 100), t.fontSize, kernsT).layout
      : layoutHeadlineH(ctx, t.text, t.x, t.y, t.maxWidth, t.fontSize * (lsPctT / 100), lsT, kernsT).layout;
    if (!layoutT.length) continue;
    if (t.whiteBg) {
      drawTextBgFromLayout(ctx, layoutT, t.whiteBgColor, t.whiteBgPad ?? 16, t.fontSize, t.whiteBgEndTrims || {});
    }
    ctx.save();
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'top';
    drawCharLayout(ctx, layoutT, t.fontSize);
    ctx.restore();
  }

  // Placed icons (on top of everything), full-resolution
  for (const icon of photo.icons || []) {
    const iconImg = await cachedImg(icon.src);
    drawPlacedIcon(ctx, iconImg, icon, 1);
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

function drawLogo(ctx, cx, cy, size) {
  const s = size / 50;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(-20, 2);
  ctx.bezierCurveTo(-22, -20, -10, -36, 0, -26);
  ctx.bezierCurveTo(10, -36, 22, -20, 20, 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, letterSpacing, charKerns, layoutOnly) {
  const lines = computeWrappedLines(ctx, text, maxWidth);
  const layout = [];
  let charIdx = 0;
  lines.forEach((line, li) => {
    const ly = y + li * lineHeight;
    if (!letterSpacing && !charKerns) {
      if (!layoutOnly) ctx.fillText(line, x, ly);
      // approximate layout for kern detection
      let cx = x;
      for (const ch of [...line]) {
        const cw = ctx.measureText(ch).width;
        layout.push({ char: ch, x: cx, y: ly, w: cw, charIdx, lineIdx: li });
        cx += cw;
        charIdx++;
      }
    } else {
      let cx = x;
      for (const ch of [...line]) {
        if (!layoutOnly) ctx.fillText(ch, cx, ly);
        const cw = ctx.measureText(ch).width;
        layout.push({ char: ch, x: cx, y: ly, w: cw, charIdx, lineIdx: li });
        cx += cw + (letterSpacing || 0) + ((charKerns?.[charIdx] || 0));
        charIdx++;
      }
    }
    if (li < lines.length - 1) charIdx++;
  });
  return layout;
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/* ════════════════════════════════════════
   Results
   ════════════════════════════════════════ */
function renderResults() {
  resultImages.innerHTML = '';
  state.generatedImages.forEach(({ dataUrl, frameName }, i) => {
    const card = document.createElement('div');
    card.className = 'result-img-card';
    card.innerHTML = `
      <img src="${dataUrl}" alt="post ${i + 1}">
      <div class="img-label">${frameName}</div>
    `;
    card.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `post_${i + 1}.jpg`;
      a.click();
    });
    resultImages.appendChild(card);
  });
}

/* ── Download ZIP ── */
btnDownload.addEventListener('click', async () => {
  if (!state.generatedImages.length) return;
  btnDownload.disabled = true;
  btnDownload.textContent = '書き出し中…';
  const label = descriptionEl.value.trim().slice(0, 25) || 'post';
  try {
    const total = state.generatedImages.length;
    const activeCaption = captionWithHashtags(activeCaptionIdx);
    const mockups = [];
    for (let i = 0; i < total; i++) {
      try {
        mockups.push(await renderInstagramMockup(
          state.generatedImages[i].dataUrl, i, total, state.accountName || 'たかはし歯科', activeCaption
        ));
      } catch (err) {
        console.error('mockup render error', err);
      }
    }
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        images: state.generatedImages.map(i => i.dataUrl),
        captions: (state.generatedCopy?.captions || []).map((_, i) => captionWithHashtags(i)),
        mockups,
        sessionLabel: label,
      }),
    });
    if (!res.ok) throw new Error('ダウンロードに失敗しました');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const cd = res.headers.get('Content-Disposition') || '';
    const m  = cd.match(/filename\*=UTF-8''(.+)/) || cd.match(/filename="(.+?)"/);
    a.download = m ? decodeURIComponent(m[1]) : 'post.zip';
    a.click();
    URL.revokeObjectURL(url);
    showToast('ダウンロード完了！');
  } catch (err) {
    showToast('エラー: ' + err.message, 3500);
  } finally {
    btnDownload.disabled = false;
    btnDownload.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>ZIPでダウンロード`;
  }
});

/* ── Selected fonts (editor dropdowns) ── */
async function loadSelectedFonts() {
  try {
    const res = await fetch('/api/selected-fonts');
    const data = await res.json();
    state.selectedFonts = data.fonts || [];
  } catch {
    state.selectedFonts = [
      'Hiragino Sans', 'Hiragino Maru Gothic Pro', 'Hiragino Mincho Pro',
      'Inter', 'Helvetica Neue', 'Arial',
    ];
  }
  populateFontSelects();
}

function populateFontSelects() {
  const opts = state.selectedFonts.map(f => `<option value="${f}">${f}</option>`).join('');
  document.getElementById('ctrlFont').innerHTML    = opts || '<option value="">なし</option>';
  document.getElementById('ctrlSubFont').innerHTML = opts || '<option value="">なし</option>';
  document.getElementById('ctFont').innerHTML      = opts || '<option value="">なし</option>';
  if (state.textStyle) {
    document.getElementById('ctrlFont').value    = state.textStyle.fontFamily;
    document.getElementById('ctrlSubFont').value = state.textStyle.subtitleFontFamily;
  }
  const selT = selectedText();
  if (selT) document.getElementById('ctFont').value = selT.fontFamily;
}

async function saveSelectedFonts() {
  try {
    await fetch('/api/selected-fonts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fonts: state.selectedFonts }),
    });
  } catch { /* silent */ }
}

/* ── All system fonts (for font manager search in Settings) ── */
async function loadSystemFonts() {
  try {
    const res = await fetch('/api/system-fonts');
    const data = await res.json();
    state.systemFonts = data.fonts || [];
  } catch {
    state.systemFonts = state.selectedFonts.slice();
  }
}

/* ── User-uploaded custom font files — beyond the curated system-font list, for a
   font the user owns but macOS doesn't have installed. Registered as a normal
   @font-face so it works in ctx.font exactly like a system font (compositeImageFor
   already awaits document.fonts.ready before drawing). ── */
function injectFontFace(entry) {
  let styleEl = document.getElementById('customFontFaces');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'customFontFaces';
    document.head.appendChild(styleEl);
  }
  const safeName = entry.name.replace(/"/g, '');
  styleEl.textContent += `\n@font-face { font-family: "${safeName}"; src: url("${entry.url}"); }`;
}

async function loadCustomFonts() {
  try {
    const res = await fetch('/api/custom-fonts');
    const data = await res.json();
    state.customFonts = data.fonts || [];
  } catch {
    state.customFonts = [];
  }
  state.customFonts.forEach(injectFontFace);
  await Promise.all(state.customFonts.map(f => document.fonts.load(`16px "${f.name}"`).catch(() => {})));
}

async function uploadCustomFont(file) {
  const ext = (file.name.split('.').pop() || 'ttf').toLowerCase();
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const reader = new FileReader();
  const dataUrl = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const res = await fetch('/api/custom-fonts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: baseName, base64: dataUrl, ext }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'アップロードに失敗しました');

  state.customFonts.push(data);
  injectFontFace(data);
  await document.fonts.load(`16px "${data.name}"`).catch(() => {});

  if (!state.systemFonts.includes(data.name)) state.systemFonts.unshift(data.name);
  if (!state.selectedFonts.includes(data.name)) {
    state.selectedFonts.push(data.name);
    state.selectedFonts.sort((a, b) => a.localeCompare(b));
    await saveSelectedFonts();
  }
  populateFontSelects();
  renderFontManager();
  showToast(`フォント「${data.name}」を追加しました`);
}

document.getElementById('btnAddCustomFont')?.addEventListener('click', () => {
  document.getElementById('customFontFileInput')?.click();
});
document.getElementById('customFontFileInput')?.addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    await uploadCustomFont(file);
  } catch (err) {
    showToast('フォントの追加に失敗しました: ' + err.message, 3500);
  }
});

/* ── Font manager UI ── */
function renderFontManager() {
  const q = document.getElementById('fontSearchInput')?.value || '';
  renderFontAvailList(q);
  renderFontSelectedList();
}

function renderFontAvailList(search = '') {
  const list = document.getElementById('fontAvailList');
  if (!list) return;
  const q = search.toLowerCase().trim();
  const items = state.systemFonts
    .filter(f => !q || f.toLowerCase().includes(q))
    .slice(0, 100);
  list.innerHTML = items.map(f => {
    const added = state.selectedFonts.includes(f);
    return `<div class="font-avail-item${added ? ' is-added' : ''}" data-font="${escHtml(f)}">
      <span>${escHtml(f)}</span>
      ${added
        ? '<span class="font-item-badge">追加済</span>'
        : `<button class="font-item-add" title="追加">+</button>`}
    </div>`;
  }).join('');
  list.querySelectorAll('.font-item-add').forEach(btn => {
    btn.addEventListener('click', async () => {
      const font = btn.closest('[data-font]').dataset.font;
      if (!state.selectedFonts.includes(font)) {
        state.selectedFonts.push(font);
        state.selectedFonts.sort((a, b) => a.localeCompare(b));
        await saveSelectedFonts();
        populateFontSelects();
        renderFontManager();
      }
    });
  });
}

function renderFontSelectedList() {
  const list = document.getElementById('fontSelectedList');
  if (!list) return;
  if (!state.selectedFonts.length) {
    list.innerHTML = '<div style="padding:10px 12px;font-size:12px;color:#aaa">フォントがありません</div>';
    return;
  }
  list.innerHTML = state.selectedFonts.map(f => `
    <div class="font-selected-item" data-font="${escHtml(f)}">
      <span>${escHtml(f)}</span>
      <button class="font-item-remove" title="削除">×</button>
    </div>
  `).join('');
  list.querySelectorAll('.font-item-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const font = btn.closest('[data-font]').dataset.font;
      state.selectedFonts = state.selectedFonts.filter(f => f !== font);
      await saveSelectedFonts();
      populateFontSelects();
      renderFontManager();
    });
  });
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('fontSearchInput')?.addEventListener('input', e => {
  renderFontAvailList(e.target.value);
});

/* ── Photo zoom — updates active photo ──
   min is below 100% (the frame-filling default) so the photo can be shrunk to
   reveal the background colour set below. */
document.getElementById('ctrlPhotoZoom').addEventListener('input', e => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.scale = +e.target.value / 100;
  document.getElementById('ctrlPhotoZoomVal').textContent = e.target.value + '%';
  schedulePreviewRedraw();
});

/* ── Photo background colour — shows behind the photo once zoomed below 100% ── */
syncColor('ctrlPhotoBgColor', 'ctrlPhotoBgColorText', () => {
  const photo = state.photos[state.previewPhotoIdx];
  if (photo) {
    photo.bgColor = document.getElementById('ctrlPhotoBgColor').value;
    schedulePreviewRedraw();
  }
});

document.getElementById('btnPhotoReset').addEventListener('click', () => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.offset = { x: 0, y: 0 };
  photo.scale = 1.0;
  photo.rotation = 0;
  photo.frameHue = 0;
  photo.frameSat = 100;
  syncFilterUI(photo);
  schedulePreviewRedraw();
});

/* ── Brightness / Contrast — updates active photo ── */
document.getElementById('ctrlBrightness').addEventListener('input', e => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.brightness = +e.target.value;
  document.getElementById('ctrlBrightnessVal').textContent = photo.brightness;
  renderThumbs();
  schedulePreviewRedraw();
});
document.getElementById('ctrlContrast').addEventListener('input', e => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.contrast = +e.target.value;
  document.getElementById('ctrlContrastVal').textContent = photo.contrast;
  renderThumbs();
  schedulePreviewRedraw();
});

/* ── Photo rotation slider ── */
document.getElementById('ctrlPhotoRotate').addEventListener('input', e => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.rotation = +e.target.value;
  document.getElementById('ctrlPhotoRotateVal').textContent = e.target.value + '°';
  schedulePreviewRedraw();
});

/* ── Frame hue / saturation (per-photo) ── */
document.getElementById('frameHue').addEventListener('input', e => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.frameHue = +e.target.value;
  document.getElementById('frameHueVal').textContent = e.target.value + '°';
  schedulePreviewRedraw();
});
document.getElementById('frameSat').addEventListener('input', e => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.frameSat = +e.target.value;
  document.getElementById('frameSatVal').textContent = e.target.value + '%';
  schedulePreviewRedraw();
});
document.getElementById('frameColorReset').addEventListener('click', () => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  photo.frameHue = 0;
  photo.frameSat = 100;
  document.getElementById('frameHue').value = 0;
  document.getElementById('frameHueVal').textContent = '0°';
  document.getElementById('frameSat').value = 100;
  document.getElementById('frameSatVal').textContent = '100%';
  schedulePreviewRedraw();
});

/* ── Hashtags — load, save, append to copy ── */
async function loadHashtags() {
  try {
    const res = await fetch('/api/hashtags');
    const data = await res.json();
    state.hashtags = data.hashtags || '';
    document.getElementById('myHashtags').value = state.hashtags;
  } catch { /* silent */ }
}

async function saveHashtags(text) {
  state.hashtags = text;
  try {
    await fetch('/api/hashtags', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashtags: text }),
    });
  } catch { /* silent */ }
}

document.getElementById('myHashtags').addEventListener('input', e => {
  saveHashtags(e.target.value);
});

/* ── Account name — shown in the exported Instagram-post-preview mockup ── */
async function loadAccountName() {
  try {
    const res = await fetch('/api/account-name');
    const data = await res.json();
    state.accountName = data.accountName || 'たかはし歯科';
  } catch {
    state.accountName = 'たかはし歯科';
  }
  document.getElementById('accountNameInput').value = state.accountName;
}

async function saveAccountName(text) {
  state.accountName = text;
  try {
    await fetch('/api/account-name', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountName: text }),
    });
  } catch { /* silent */ }
}

document.getElementById('accountNameInput').addEventListener('input', e => {
  saveAccountName(e.target.value);
});

function captionWithHashtags(idx) {
  const base = state.generatedCopy?.captions?.[idx] || '';
  const tags = state.hashtags.trim();
  return tags ? base + '\n\n' + tags : base;
}

/* ════════════════════════════════════════
   Instagram post-screen mockup — a screenshot-style preview (avatar, account
   name, action icons, caption) combined with the actual post image, so a
   client can review "what this will look like" without anything being
   published first. Included alongside post_N.jpg / captions.txt on export.
   ════════════════════════════════════════ */
function wrapCaptionWithName(ctx, accountName, caption, maxWidth, nameFont, capFont) {
  ctx.font = nameFont;
  const nameWidth = ctx.measureText(accountName + '  ').width;
  ctx.font = capFont;
  const lines = [];
  let firstLine = true;
  for (const paragraph of caption.split('\n')) {
    if (paragraph === '') { lines.push({ text: '', first: firstLine }); firstLine = false; continue; }
    let line = '';
    let limit = firstLine ? maxWidth - nameWidth : maxWidth;
    for (const ch of paragraph) {
      const test = line + ch;
      if (ctx.measureText(test).width > limit && line) {
        lines.push({ text: line, first: firstLine });
        firstLine = false;
        limit = maxWidth;
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push({ text: line, first: firstLine });
    firstLine = false;
    limit = maxWidth;
  }
  return { lines, nameWidth };
}

function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function drawHeartIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.88);
  ctx.bezierCurveTo(s * 0.5, s * 0.88, s * 0.05, s * 0.55, s * 0.05, s * 0.28);
  ctx.bezierCurveTo(s * 0.05, s * 0.05, s * 0.35, -s * 0.05, s * 0.5, s * 0.18);
  ctx.bezierCurveTo(s * 0.65, -s * 0.05, s * 0.95, s * 0.05, s * 0.95, s * 0.28);
  ctx.bezierCurveTo(s * 0.95, s * 0.55, s * 0.5, s * 0.88, s * 0.5, s * 0.88);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawCommentIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(0, 0, s, s * 0.8, s * 0.35);
  else ctx.rect(0, 0, s, s * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.22, s * 0.78);
  ctx.lineTo(s * 0.14, s * 1.0);
  ctx.lineTo(s * 0.42, s * 0.78);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawShareIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, s * 0.15);
  ctx.lineTo(s, s * 0.5);
  ctx.lineTo(0, s * 0.85);
  ctx.lineTo(s * 0.28, s * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawBookmarkIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(s * 0.12, 0);
  ctx.lineTo(s * 0.88, 0);
  ctx.lineTo(s * 0.88, s);
  ctx.lineTo(s * 0.5, s * 0.72);
  ctx.lineTo(s * 0.12, s);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

async function renderInstagramMockup(photoDataUrl, index, total, accountName, caption) {
  const W = 1080;
  const headerH = 150;
  const actionH = 130;
  const pad = 36;
  const lineHeight = 40;
  const nameFont = 'bold 32px "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';
  const capFont = '32px "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';

  const photoImg = await loadImg(photoDataUrl);
  const photoH = W * (photoImg.height / photoImg.width);

  const measureCtx = document.createElement('canvas').getContext('2d');
  const maxTextWidth = W - pad * 2;
  const { lines, nameWidth } = wrapCaptionWithName(measureCtx, accountName, caption, maxTextWidth, nameFont, capFont);
  const captionBlockH = lines.length * lineHeight + pad;

  const totalH = Math.round(headerH + photoH + actionH + captionBlockH);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, totalH);

  // Header — avatar, account name, "more options" dots
  const avatarD = 92;
  const avatarX = pad, avatarY = (headerH - avatarD) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarD / 2, avatarY + avatarD / 2, avatarD / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const logoImg = await loadImg('/icons/lobo_c.png');
    ctx.fillStyle = '#fff';
    ctx.fillRect(avatarX, avatarY, avatarD, avatarD);
    const inset = avatarD * 0.14;
    ctx.drawImage(logoImg, avatarX + inset, avatarY + inset, avatarD - inset * 2, avatarD - inset * 2);
  } catch {
    ctx.fillStyle = '#ee6178';
    ctx.fillRect(avatarX, avatarY, avatarD, avatarD);
  }
  ctx.restore();

  ctx.fillStyle = '#000';
  ctx.font = nameFont;
  ctx.textBaseline = 'middle';
  ctx.fillText(accountName, avatarX + avatarD + 24, headerH / 2);

  ctx.fillStyle = '#000';
  const dotsY = headerH / 2, dotR = 5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(W - pad - i * dotR * 3, dotsY, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Photo
  ctx.drawImage(photoImg, 0, headerH, W, photoH);

  // Multi-photo indicators (page badge + dots), matching a carousel post
  if (total > 1) {
    ctx.font = '600 24px "Hiragino Sans", sans-serif';
    const badgeText = `${index + 1}/${total}`;
    const tw = ctx.measureText(badgeText).width;
    const bw = tw + 32, bh = 40;
    const bx = W - bw - 24, by = headerH + 24;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    fillRoundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, bx + 16, by + bh / 2);

    const dotD = 12, spacing = 20;
    const dotsStartX = W / 2 - ((total - 1) * spacing) / 2;
    const dotsDy = headerH + photoH - 32;
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i === index ? '#fff' : 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(dotsStartX + i * spacing, dotsDy, dotD / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Action icons
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const iconSize = 56;
  const iconY = headerH + photoH + (actionH - iconSize) / 2;
  let ix = pad;
  drawHeartIcon(ctx, ix, iconY, iconSize); ix += iconSize + 28;
  drawCommentIcon(ctx, ix, iconY, iconSize); ix += iconSize + 28;
  drawShareIcon(ctx, ix, iconY, iconSize);
  drawBookmarkIcon(ctx, W - pad - iconSize, iconY, iconSize);

  // Caption — bold account name prefix on the first wrapped line, then the
  // caption text (with hashtags) below.
  ctx.textBaseline = 'top';
  let cy = headerH + photoH + actionH + pad / 2;
  for (const entry of lines) {
    let x = pad;
    if (entry.first) {
      ctx.font = nameFont;
      ctx.fillStyle = '#000';
      ctx.fillText(accountName + '  ', pad, cy);
      x = pad + nameWidth;
    }
    ctx.font = capFont;
    ctx.fillStyle = '#000';
    ctx.fillText(entry.text, x, cy);
    cy += lineHeight;
  }

  return canvas.toDataURL('image/jpeg', 0.92);
}

/* ════════════════════════════════════════
   Icons (stickers)
   ════════════════════════════════════════ */
async function loadIcons() {
  try {
    const res = await fetch('/api/icons');
    const data = await res.json();
    state.availableIcons = data.icons || [];
  } catch {
    state.availableIcons = [];
  }
  renderIconPicker();
}

function renderIconPicker() {
  iconPicker.innerHTML = '';
  state.availableIcons.forEach(icon => {
    const wrap = document.createElement('div');
    wrap.className = 'icon-cell-wrap';
    const cell = document.createElement('button');
    cell.className = 'icon-cell';
    cell.title = icon.name;
    cell.innerHTML = `<img src="${icon.url}" alt="${escHtml(icon.name)}" loading="lazy">`;
    cell.addEventListener('click', () => addIconToPhoto(icon.url));
    wrap.appendChild(cell);
    // Only user-uploaded icons (always "custom-…") can be deleted — never the
    // bundled たかはし歯科 mark set.
    if (icon.name.startsWith('custom-')) {
      const del = document.createElement('button');
      del.className = 'icon-delete';
      del.title = '削除';
      del.textContent = '×';
      del.addEventListener('click', e => { e.stopPropagation(); deleteIcon(icon); });
      wrap.appendChild(del);
    }
    iconPicker.appendChild(wrap);
  });

  const addCell = document.createElement('button');
  addCell.className = 'icon-cell icon-add-cell';
  addCell.title = 'アイコンを追加';
  addCell.textContent = '+';
  addCell.addEventListener('click', () => iconFileInput.click());
  iconPicker.appendChild(addCell);
}

function handleIconFile(file) {
  if (!file) return;
  const ext = file.name.endsWith('.svg') || file.type.includes('svg') ? 'svg' : 'png';
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const res = await fetch('/api/icons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: e.target.result, ext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'アップロードに失敗しました');
      state.availableIcons.push(data);
      renderIconPicker();
      showToast('アイコンを追加しました');
    } catch (err) {
      showToast('追加に失敗しました: ' + err.message, 3000);
    }
  };
  reader.readAsDataURL(file);
}
iconFileInput.addEventListener('change', e => {
  handleIconFile(e.target.files[0]);
  e.target.value = '';
});

async function deleteIcon(icon) {
  if (!confirm(`このアイコンを削除しますか？`)) return;
  try {
    const res = await fetch(`/api/icons/${encodeURIComponent(icon.name)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error((await res.json()).error || '削除に失敗しました');
    state.availableIcons = state.availableIcons.filter(i => i.name !== icon.name);
    renderIconPicker();
    showToast('アイコンを削除しました');
  } catch (err) {
    showToast('削除に失敗しました: ' + err.message, 3000);
  }
}

async function addIconToPhoto(src) {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) { showToast('先に写真を追加してください'); return; }
  let aspect = 1;
  try { const img = await cachedImg(src); aspect = img.height / img.width; } catch {}
  const icon = {
    id: 'ic_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    src,
    x: 540, y: 675,
    scale: 1.0, rotation: 0, opacity: 100,
    aspect,
  };
  photo.icons.push(icon);
  state.selectedIconId = icon.id;
  renderPlacedIcons();
  renderIconSettings();
  schedulePreviewRedraw();
}

function getActiveIcons() {
  return state.photos[state.previewPhotoIdx]?.icons || [];
}

function getSelectedIcon() {
  return getActiveIcons().find(ic => ic.id === state.selectedIconId) || null;
}

function selectIcon(id) {
  state.selectedIconId = id;
  renderPlacedIcons();
  renderIconSettings();
  schedulePreviewRedraw();
}

function renderPlacedIcons() {
  const icons = getActiveIcons();
  if (!icons.length) {
    iconPlacedWrap.hidden = true;
    iconPlacedList.innerHTML = '';
    return;
  }
  iconPlacedWrap.hidden = false;
  iconPlacedList.innerHTML = '';
  icons.forEach((icon, i) => {
    const chip = document.createElement('button');
    chip.className = 'icon-chip' + (icon.id === state.selectedIconId ? ' active' : '');
    chip.innerHTML = `<img src="${icon.src}" alt=""><span>${i + 1}</span>`;
    chip.addEventListener('click', () => selectIcon(icon.id));
    iconPlacedList.appendChild(chip);
  });
}

function renderIconSettings() {
  const icon = getSelectedIcon();
  if (!icon) { iconSettings.hidden = true; return; }
  iconSettings.hidden = false;
  document.getElementById('iconX').value = icon.x;
  document.getElementById('iconXVal').textContent = icon.x;
  document.getElementById('iconY').value = icon.y;
  document.getElementById('iconYVal').textContent = icon.y;
  const scalePct = Math.round(icon.scale * 100);
  document.getElementById('iconScale').value = scalePct;
  document.getElementById('iconScaleVal').textContent = scalePct + '%';
  document.getElementById('iconRotate').value = icon.rotation;
  document.getElementById('iconRotateVal').textContent = icon.rotation + '°';
  document.getElementById('iconOpacity').value = icon.opacity;
  document.getElementById('iconOpacityVal').textContent = icon.opacity + '%';
}

document.getElementById('iconX').addEventListener('input', e => {
  const icon = getSelectedIcon(); if (!icon) return;
  icon.x = +e.target.value;
  document.getElementById('iconXVal').textContent = icon.x;
  schedulePreviewRedraw();
});
document.getElementById('iconY').addEventListener('input', e => {
  const icon = getSelectedIcon(); if (!icon) return;
  icon.y = +e.target.value;
  document.getElementById('iconYVal').textContent = icon.y;
  schedulePreviewRedraw();
});
document.getElementById('iconScale').addEventListener('input', e => {
  const icon = getSelectedIcon(); if (!icon) return;
  icon.scale = +e.target.value / 100;
  document.getElementById('iconScaleVal').textContent = e.target.value + '%';
  schedulePreviewRedraw();
});
document.getElementById('iconRotate').addEventListener('input', e => {
  const icon = getSelectedIcon(); if (!icon) return;
  icon.rotation = +e.target.value;
  document.getElementById('iconRotateVal').textContent = e.target.value + '°';
  schedulePreviewRedraw();
});
document.getElementById('iconOpacity').addEventListener('input', e => {
  const icon = getSelectedIcon(); if (!icon) return;
  icon.opacity = +e.target.value;
  document.getElementById('iconOpacityVal').textContent = e.target.value + '%';
  schedulePreviewRedraw();
});
btnIconDelete.addEventListener('click', () => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) return;
  const idx = photo.icons.findIndex(ic => ic.id === state.selectedIconId);
  if (idx < 0) return;
  photo.icons.splice(idx, 1);
  state.selectedIconId = photo.icons.length ? photo.icons[photo.icons.length - 1].id : null;
  renderPlacedIcons();
  renderIconSettings();
  schedulePreviewRedraw();
});

/* ── Letter spacing / line spacing sliders ── */
document.getElementById('ctrlLetterSpacing').addEventListener('input', e => {
  if (state.textStyle) {
    state.textStyle.letterSpacing = +e.target.value;
    document.getElementById('ctrlLetterSpacingVal').textContent = e.target.value;
    schedulePreviewRedraw();
  }
});
document.getElementById('ctrlLineSpacing').addEventListener('input', e => {
  if (state.textStyle) {
    state.textStyle.lineSpacing = +e.target.value;
    document.getElementById('ctrlLineSpacingVal').textContent = e.target.value + '%';
    schedulePreviewRedraw();
  }
});
document.getElementById('ctrlSubLetterSpacing').addEventListener('input', e => {
  if (state.textStyle) {
    state.textStyle.subLetterSpacing = +e.target.value;
    document.getElementById('ctrlSubLetterSpacingVal').textContent = e.target.value;
    schedulePreviewRedraw();
  }
});
document.getElementById('ctrlSubLineSpacing').addEventListener('input', e => {
  if (state.textStyle) {
    state.textStyle.subLineSpacing = +e.target.value;
    document.getElementById('ctrlSubLineSpacingVal').textContent = e.target.value + '%';
    schedulePreviewRedraw();
  }
});

/* ════════════════════════════════════════
   Custom text boxes — free-placed text beyond the headline/subtitle, with the
   exact same editing capabilities (font, weight, size, 字間/letter spacing,
   行間/line spacing, per-character kerning, colour, white background with
   per-line trim, vertical/horizontal orientation, drag & resize on canvas).
   They reuse the very same layout/draw helpers the headline uses, so the two
   can never drift apart in behaviour.
   ════════════════════════════════════════ */
function activeTexts() {
  return state.photos[state.previewPhotoIdx]?.texts || [];
}

function selectedText() {
  return activeTexts().find(t => t.id === state.selectedTextId) || null;
}

function makeCustomText() {
  return {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    text: 'テキスト',
    fontFamily: state.textStyle?.fontFamily || state.selectedFonts[0] || 'Hiragino Sans',
    fontWeight: '700',
    fontSize: 48,
    color: '#1a1a1a',
    x: 120, y: 700, maxWidth: 800,
    vertical: false,
    letterSpacing: 0,
    lineSpacing: 115,
    charKerns: {},
    whiteBg: false, whiteBgColor: '#ffffff', whiteBgPad: 16, whiteBgEndTrims: {},
  };
}

function renderCtList() {
  const list = document.getElementById('ctList');
  if (!list) return;
  const texts = activeTexts();
  list.innerHTML = '';
  texts.forEach((t, i) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'ct-chip' + (t.id === state.selectedTextId ? ' active' : '');
    const label = (t.text || '').replace(/\n/g, ' ').trim().slice(0, 12) || `テキスト${i + 1}`;
    chip.textContent = label;
    chip.title = t.text;
    chip.addEventListener('click', () => selectCustomText(t.id));
    list.appendChild(chip);
  });
}

function selectCustomText(id) {
  state.selectedTextId = id;
  // Selecting a text moves the kern cursor with it — an orphaned cursor
  // pointing at a different text's char index would edit the wrong glyph.
  if (state.kernTargetId !== id) { state.kernCursor = null; state.kernTargetId = id; }
  renderCtList();
  renderCtSettings();
  schedulePreviewRedraw();
}

function renderCtSettings() {
  const box = document.getElementById('ctSettings');
  if (!box) return;
  const t = selectedText();
  box.hidden = !t;
  if (!t) return;
  document.getElementById('ctText').value = t.text;
  document.getElementById('ctFont').value = t.fontFamily;
  document.getElementById('ctFontWeight').value = t.fontWeight;
  document.getElementById('ctSize').value = t.fontSize;
  document.getElementById('ctSizeVal').textContent = t.fontSize;
  document.getElementById('ctLetterSpacing').value = t.letterSpacing ?? 0;
  document.getElementById('ctLetterSpacingVal').textContent = t.letterSpacing ?? 0;
  document.getElementById('ctLineSpacing').value = t.lineSpacing ?? 115;
  document.getElementById('ctLineSpacingVal').textContent = (t.lineSpacing ?? 115) + '%';
  document.getElementById('ctColor').value = t.color;
  document.getElementById('ctColorText').value = t.color;
  document.getElementById('ctWhiteBg').checked = !!t.whiteBg;
  document.getElementById('ctBgColorRow').hidden = !t.whiteBg;
  document.getElementById('ctBgColor').value = t.whiteBgColor || '#ffffff';
  document.getElementById('ctBgColorText').value = t.whiteBgColor || '#ffffff';
  document.getElementById('ctPosX').value = t.x;
  document.getElementById('ctPosXVal').textContent = t.x;
  document.getElementById('ctPosY').value = t.y;
  document.getElementById('ctPosYVal').textContent = t.y;
  document.getElementById('ctMaxW').value = t.maxWidth;
  document.getElementById('ctMaxWVal').textContent = t.maxWidth;
  document.getElementById('ctHoriz').classList.toggle('active', !t.vertical);
  document.getElementById('ctVert').classList.toggle('active', !!t.vertical);
}

/* Per-line/column whiteBg trim sliders for the selected custom text —
   mirrors renderBgTrimSliders() for the headline. */
function renderCtBgTrimSliders() {
  const container = document.getElementById('ctBgEndRows');
  if (!container) return;
  const t = selectedText();
  if (!t || !t.whiteBg) { container.innerHTML = ''; return; }
  const cached = state._textLayouts[t.id];
  const layout = cached?.layout;
  if (!layout || !layout.length) { container.innerHTML = ''; return; }

  const lineIndices = [...new Set(layout.map(it => it.lineIdx))].sort((a, b) => a - b);
  const trims = t.whiteBgEndTrims || {};
  container.innerHTML = lineIndices.map(li => {
    const label = t.vertical ? `列${li + 1}末尾` : `行${li + 1}末尾`;
    const val = trims[li] ?? 0;
    return `<div class="edit-ctrl-row">
      <label>${label}</label>
      <input type="range" class="ct-trim-slider" data-li="${li}" min="-200" max="800" value="${val}">
      <span class="ctrl-val ct-trim-val" data-li="${li}">${val}</span>
    </div>`;
  }).join('');
}

document.getElementById('ctBgEndRows').addEventListener('input', e => {
  if (!e.target.classList.contains('ct-trim-slider')) return;
  const t = selectedText();
  if (!t) return;
  const li = +e.target.dataset.li;
  const v = +e.target.value;
  if (!t.whiteBgEndTrims) t.whiteBgEndTrims = {};
  t.whiteBgEndTrims[li] = v;
  const valEl = document.querySelector(`.ct-trim-val[data-li="${li}"]`);
  if (valEl) valEl.textContent = v;
  schedulePreviewRedraw();
});

document.getElementById('btnAddCustomText').addEventListener('click', () => {
  const photo = state.photos[state.previewPhotoIdx];
  if (!photo) { showToast('先に写真を追加してください'); return; }
  if (!photo.texts) photo.texts = [];
  const t = makeCustomText();
  photo.texts.push(t);
  selectCustomText(t.id);
});

document.getElementById('btnCtDelete').addEventListener('click', () => {
  const photo = state.photos[state.previewPhotoIdx];
  const t = selectedText();
  if (!photo || !t) return;
  photo.texts = photo.texts.filter(x => x.id !== t.id);
  state.selectedTextId = null;
  if (state.kernTargetId === t.id) { state.kernCursor = null; state.kernTargetId = null; }
  renderCtList();
  renderCtSettings();
  schedulePreviewRedraw();
});

document.getElementById('ctText').addEventListener('input', e => {
  const t = selectedText();
  if (!t) return;
  t.text = e.target.value;
  renderCtList();
  schedulePreviewRedraw();
});

/* Slider → property, mirroring bindSlider() but scoped to the selected text. */
function bindCtSlider(sliderId, valId, key, suffix = '') {
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(valId);
  slider.addEventListener('input', () => {
    const t = selectedText();
    const v = +slider.value;
    valEl.textContent = v + suffix;
    if (t) { t[key] = v; schedulePreviewRedraw(); }
  });
}
bindCtSlider('ctSize', 'ctSizeVal', 'fontSize');
bindCtSlider('ctLetterSpacing', 'ctLetterSpacingVal', 'letterSpacing');
bindCtSlider('ctLineSpacing', 'ctLineSpacingVal', 'lineSpacing', '%');
bindCtSlider('ctPosX', 'ctPosXVal', 'x');
bindCtSlider('ctPosY', 'ctPosYVal', 'y');
bindCtSlider('ctMaxW', 'ctMaxWVal', 'maxWidth');

document.getElementById('ctFont').addEventListener('change', e => {
  const t = selectedText();
  if (t) { t.fontFamily = e.target.value; schedulePreviewRedraw(); }
});
document.getElementById('ctFontWeight').addEventListener('change', e => {
  const t = selectedText();
  if (t) { t.fontWeight = e.target.value; schedulePreviewRedraw(); }
});
syncColor('ctColor', 'ctColorText', () => {
  const t = selectedText();
  if (t) { t.color = document.getElementById('ctColor').value; schedulePreviewRedraw(); }
});
syncColor('ctBgColor', 'ctBgColorText', () => {
  const t = selectedText();
  if (t) { t.whiteBgColor = document.getElementById('ctBgColor').value; schedulePreviewRedraw(); }
});
document.getElementById('ctWhiteBg').addEventListener('change', e => {
  const t = selectedText();
  const on = e.target.checked;
  if (t) t.whiteBg = on;
  document.getElementById('ctBgColorRow').hidden = !on;
  schedulePreviewRedraw();
});
document.getElementById('ctHoriz').addEventListener('click', () => {
  const t = selectedText();
  if (!t) return;
  t.vertical = false;
  renderCtSettings();
  schedulePreviewRedraw();
});
document.getElementById('ctVert').addEventListener('click', () => {
  const t = selectedText();
  if (!t) return;
  t.vertical = true;
  renderCtSettings();
  schedulePreviewRedraw();
});

/* ── Kerning: Option+arrows adjust kern at cursor.
   Horizontal: ←/→ ・ Vertical: ↑/↓ (also accepts the other pair). ── */
window.addEventListener('keydown', e => {
  if (!e.altKey) return;
  const dec = e.key === 'ArrowLeft'  || e.key === 'ArrowUp';
  const inc = e.key === 'ArrowRight' || e.key === 'ArrowDown';
  if (!dec && !inc) return;
  if (state.kernCursor === null || state.kernCursor === undefined) return;
  // The cursor belongs either to the headline (kernTargetId === null) or to one
  // of the custom text boxes — write the kern into whichever it points at.
  const target = state.kernTargetId
    ? activeTexts().find(t => t.id === state.kernTargetId)
    : state.textStyle;
  if (!target) return;
  if (!target.charKerns) target.charKerns = {};
  const pos = state.kernCursor;
  target.charKerns[pos] = (target.charKerns[pos] || 0) + (dec ? -2 : 2);
  e.preventDefault();
  schedulePreviewRedraw();
});

/* ── Reference info toggle (Method C) ── */
document.getElementById('refToggle').addEventListener('click', () => {
  const ta = document.getElementById('referenceText');
  const wasHidden = ta.hidden;
  ta.hidden = !wasHidden;
  const icon = document.querySelector('#refToggle svg');
  if (icon) icon.style.transform = wasHidden ? 'rotate(45deg)' : '';
});

/* ════════════════════════════════════════
   Project save/open (.tak file format)
   ════════════════════════════════════════ */
const TAK_FORMAT = 'tak-dental-ig-project';
// v2 = folder bundle: photos live as real files under images/ and are
// referenced by `imageFile`. v1 files (embedded `dataUrl`) still open fine.
const TAK_VERSION = 2;

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function blobUrlToDataURL(url) {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return fileToDataURL(blob);
}

// Snapshot a frame (config + overlay image bytes) so a project file can
// recreate it on another machine/install where the frame doesn't exist.
async function frameToSnapshot(frame) {
  if (!frame) return null;
  try {
    const res = await fetch(frame.overlayUrl);
    const blob = await res.blob();
    const ext = (frame.overlayUrl.match(/\.(\w+)(?:\?|$)/) || [, 'svg'])[1];
    const overlayBase64 = await fileToDataURL(blob);
    return { name: frame.name, description: frame.description || '', ext, overlayBase64, config: frame.config };
  } catch {
    return null;
  }
}

async function collectProjectData() {
  const photos = [];
  for (const p of state.photos) {
    const dataUrl = p.url.startsWith('data:') ? p.url : await blobUrlToDataURL(p.url);
    const frame = p.frameId ? state.availableFrames.find(f => f.id === p.frameId) : null;
    photos.push({
      dataUrl,
      filter: p.filter,
      brightness: p.brightness,
      contrast: p.contrast,
      frameId: p.frameId,
      frameSnapshot: frame ? await frameToSnapshot(frame) : null,
      offset: { ...p.offset },
      scale: p.scale,
      rotation: p.rotation,
      frameHue: p.frameHue,
      frameSat: p.frameSat,
      textStyle: p.textStyle ? JSON.parse(JSON.stringify(p.textStyle)) : null,
      icons: JSON.parse(JSON.stringify(p.icons || [])),
      texts: JSON.parse(JSON.stringify(p.texts || [])),
    });
  }

  return {
    takFormat: TAK_FORMAT,
    takVersion: TAK_VERSION,
    savedAt: new Date().toISOString(),
    description: descriptionEl.value,
    referenceText: document.getElementById('referenceText')?.value || '',
    emojiMode: state.emojiMode,
    hashtags: state.hashtags,
    generatedCopy: state.generatedCopy ? JSON.parse(JSON.stringify(state.generatedCopy)) : null,
    previewPhotoIdx: state.previewPhotoIdx,
    photos,
  };
}

// Re-register a frame from its embedded snapshot (used when opening a
// project on a machine/install where the referenced frameId doesn't exist).
async function recreateFrameFromSnapshot(snapshot) {
  try {
    const res = await fetch('/api/frames', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: snapshot.name,
        description: snapshot.description,
        overlayBase64: snapshot.overlayBase64,
        ext: snapshot.ext,
        config: snapshot.config,
      }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    state.availableFrames.push(data);
    return data.id;
  } catch {
    return null;
  }
}

function resetProject() {
  state.photos.forEach(p => { if (p.url?.startsWith('blob:')) URL.revokeObjectURL(p.url); });
  state.photos = [];
  state.previewPhotoIdx = 0;
  state.selectedIconId = null;
  state.selectedTextId = null;
  state.kernCursor = null;
  state.kernTargetId = null;
  state.generatedCopy = null;
  state.generatedImages = [];
  state.textStyle = null;
  state.currentProjectPath = null;
  descriptionEl.value = '';
  const refEl = document.getElementById('referenceText');
  if (refEl) { refEl.value = ''; refEl.hidden = true; }
  renderCtList();
  renderCtSettings();
  renderThumbs();
  renderFrameGrid(state.availableFrames);
  updateGenerateBtn();
  setOutput('empty');
}

async function applyProjectData(project) {
  if (!project || project.takFormat !== TAK_FORMAT) {
    throw new Error('無効なプロジェクトファイルです');
  }

  state.photos.forEach(p => { if (p.url?.startsWith('blob:')) URL.revokeObjectURL(p.url); });
  state.photos = [];
  state.previewPhotoIdx = 0;
  state.selectedIconId = null;
  state.selectedTextId = null;
  state.kernCursor = null;
  state.kernTargetId = null;
  state.generatedImages = [];

  descriptionEl.value = project.description || '';
  const refEl = document.getElementById('referenceText');
  if (refEl) {
    refEl.value = project.referenceText || '';
    refEl.hidden = !project.referenceText;
  }

  state.emojiMode = project.emojiMode === 'without' ? 'without' : 'with';
  document.getElementById('emojiWith')?.classList.toggle('active', state.emojiMode === 'with');
  document.getElementById('emojiWithout')?.classList.toggle('active', state.emojiMode === 'without');

  if (typeof project.hashtags === 'string') {
    state.hashtags = project.hashtags;
    const htEl = document.getElementById('myHashtags');
    if (htEl) htEl.value = project.hashtags;
  }

  state.generatedCopy = project.generatedCopy || null;

  for (const sp of project.photos || []) {
    // Bundle projects carry `imageFile`, which the main process inlines into
    // `dataUrl` on open. A missing entry means the image file was moved or
    // deleted out of the folder — skip it rather than adding a broken photo.
    if (!sp.dataUrl) continue;
    let frameId = sp.frameId || null;
    if (frameId && !state.availableFrames.some(f => f.id === frameId)) {
      frameId = sp.frameSnapshot ? await recreateFrameFromSnapshot(sp.frameSnapshot) : null;
    }
    state.photos.push({
      file: null,
      url: sp.dataUrl,
      filter: sp.filter || 'normal',
      brightness: sp.brightness ?? 100,
      contrast: sp.contrast ?? 100,
      frameId,
      offset: sp.offset ? { ...sp.offset } : { x: 0, y: 0 },
      scale: sp.scale ?? 1.0,
      rotation: sp.rotation ?? 0,
      frameHue: sp.frameHue ?? 0,
      frameSat: sp.frameSat ?? 100,
      textStyle: sp.textStyle ? JSON.parse(JSON.stringify(sp.textStyle)) : null,
      icons: Array.isArray(sp.icons) ? JSON.parse(JSON.stringify(sp.icons)) : [],
      texts: Array.isArray(sp.texts) ? JSON.parse(JSON.stringify(sp.texts)) : [],
    });
  }

  state.previewPhotoIdx = Math.min(project.previewPhotoIdx || 0, Math.max(0, state.photos.length - 1));

  renderThumbs();
  renderFrameGrid(state.availableFrames);
  updateGenerateBtn();

  const active = state.photos[state.previewPhotoIdx];
  state.textStyle = active?.textStyle || null;

  if (active) syncFilterUI(active);

  if (state.generatedCopy && active?.textStyle) {
    syncTextStyleUI();
    renderCtList();
    renderCtSettings();
    renderPlacedIcons();
    renderIconSettings();
    updatePreviewPhotoLabel();
    renderCaption(0);
    setOutput('editing');
    schedulePreviewRedraw();
  } else {
    setOutput('empty');
  }
}

// Splits the embedded photo data URLs out of the project object into a
// separate file list, leaving relative `imageFile` references behind. The main
// process then writes them as real files under the bundle's images/ folder.
function extractBundleImages(projectObj) {
  const images = [];
  (projectObj.photos || []).forEach((p, i) => {
    if (!p.dataUrl) return;
    const mime = (p.dataUrl.match(/^data:([^;]+);/) || [, 'image/png'])[1];
    const ext = mime === 'image/jpeg' ? 'jpg'
      : mime === 'image/webp' ? 'webp'
      : mime === 'image/gif' ? 'gif' : 'png';
    const name = `photo_${i + 1}.${ext}`;
    images.push({ name, dataUrl: p.dataUrl });
    p.imageFile = `images/${name}`;
    delete p.dataUrl;
  });
  return images;
}

async function saveProjectFlow(forceSaveAs) {
  if (!window.electronAPI) { showToast('この機能はデスクトップアプリでのみ利用できます'); return; }
  if (!state.photos.length) { showToast('保存する内容がありません'); return; }
  try {
    const projectObj = await collectProjectData();
    const images = extractBundleImages(projectObj);
    const jsonString = JSON.stringify(projectObj);
    const result = await window.electronAPI.saveProjectBundle(
      jsonString, images, state.currentProjectPath, !!forceSaveAs
    );
    if (result.canceled) return;
    if (result.error) { showToast('保存に失敗しました: ' + result.error, 4000); return; }
    state.currentProjectPath = result.filePath;
    showToast(`プロジェクトフォルダに保存しました（画像${images.length}点を同梱）`);
  } catch (err) {
    showToast('保存に失敗しました: ' + err.message, 4000);
  }
}

async function loadProjectFromContent(content, filePath) {
  try {
    const project = JSON.parse(content);
    await applyProjectData(project);
    state.currentProjectPath = filePath || null;
    showToast('プロジェクトを開きました');
  } catch (err) {
    showToast('プロジェクトファイルの読み込みに失敗しました: ' + err.message, 4000);
  }
}

async function openProjectFlow() {
  if (!window.electronAPI) { showToast('この機能はデスクトップアプリでのみ利用できます'); return; }
  const result = await window.electronAPI.openProject();
  if (result.canceled) return;
  if (result.error) { showToast('開けませんでした: ' + result.error, 4000); return; }
  await loadProjectFromContent(result.content, result.filePath);
}

btnSaveProject.addEventListener('click', () => saveProjectFlow(false));
btnOpenProject.addEventListener('click', () => openProjectFlow());

if (window.electronAPI) {
  window.electronAPI.onLoadProject(({ content, filePath }) => loadProjectFromContent(content, filePath));
  window.electronAPI.onMenuNewProject(() => {
    if (!state.photos.length || confirm('保存されていない変更は失われます。新規プロジェクトを開始しますか？')) {
      resetProject();
    }
  });
  window.electronAPI.onMenuSaveProject(() => saveProjectFlow(false));
  window.electronAPI.onMenuSaveProjectAs(() => saveProjectFlow(true));
  window.electronAPI.onMenuOpenProject(() => openProjectFlow());
  window.electronAPI.onMenuExportZip(() => {
    if (!btnDownload.disabled) btnDownload.click();
    else showToast('先に「合成して確定」を行ってください');
  });
}

/* ── Init ── */
loadFrames();
loadSettings();
loadSelectedFonts();
loadSystemFonts();
loadCustomFonts();
loadHashtags();
loadAccountName();
loadIcons();
