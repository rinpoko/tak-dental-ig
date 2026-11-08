/* ════════════════════════════════════════
   Video posts
   A video takes the place of 背景の写真. Everything layered on top — frame,
   キャッチ, サブタイトル, icons, added texts, drop shadows — works exactly as
   on a photo. The timeline under the preview cuts the video: trim either end,
   split at the playhead, delete, reorder by dragging, and join more videos.
   Export renders every frame with the layers on top into an MP4 (H.264 + AAC).

   Loaded after app.js and uses its globals (state, schedulePreviewRedraw …).
   ════════════════════════════════════════ */
const VIDEO_FPS = 30;
const VIDEO_BITRATE = 10_000_000;
const AUDIO_BITRATE = 160_000;
const AUDIO_RATE = 48000;
const MIN_CLIP = 0.2;            // shortest clip, in seconds
const VIDEO_EXT_RE = /\.(mov|mp4|m4v|webm|mkv)$/i;

// Source files live here rather than in state.photos, so undo snapshots and
// copy/paste only carry the light clip list.
const videoSources = new Map();  // srcId → { id, blob, name, url, duration, t0, width, height, hasAudio, posterUrl, strip, el }

let mediabunnyPromise = null;
const loadMediabunny = () => (mediabunnyPromise ||= import('./vendor/mediabunny.min.js'));

const isVideoFile = f => f.type.startsWith('video/') || VIDEO_EXT_RE.test(f.name || '');
const isVideoPhoto = p => p?.kind === 'video' && !!p.video;
const videoClips = p => (isVideoPhoto(p) ? p.video.clips : []);
const clipLen = c => Math.max(0, c.out - c.in);
const videoDuration = p => videoClips(p).reduce((s, c) => s + clipLen(c), 0);
function clipStartOf(p, clip) {
  let s = 0;
  for (const c of videoClips(p)) { if (c === clip) return s; s += clipLen(c); }
  return s;
}
function fmtVideoTime(t) {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`;
}

async function canvasToObjectUrl(canvas, quality = 0.85) {
  const blob = canvas.convertToBlob
    ? await canvas.convertToBlob({ type: 'image/jpeg', quality })
    : await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
  return URL.createObjectURL(blob);
}

// Hidden home for the <video> elements — iOS Safari only paints frames of a
// video that is in the document.
const videoElHome = document.createElement('div');
videoElHome.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0;pointer-events:none;';
document.body.appendChild(videoElHome);

/* ── Sources ── */
async function openVideoInput(blob) {
  const MB = await loadMediabunny();
  return new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
}

async function registerVideoSource(blob, name, id = newId('vs_')) {
  if (videoSources.has(id)) return videoSources.get(id);
  const MB = await loadMediabunny();
  const input = await openVideoInput(blob);
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('映像が入っていないファイルです');
  if (!(await track.canDecode())) throw new Error('この動画の形式はここでは読み込めません');
  const audio = await input.getPrimaryAudioTrack();
  const hasAudio = !!audio && await audio.canDecode();
  const t0 = await track.getFirstTimestamp();
  const duration = Math.max(MIN_CLIP, (await input.computeDuration()) - Math.max(0, t0));
  const src = {
    id, blob, name: name || 'video.mp4', url: URL.createObjectURL(blob),
    duration, t0, width: track.displayWidth, height: track.displayHeight,
    hasAudio, posterUrl: null, strip: [], el: null,
  };
  const posterSink = new MB.CanvasSink(track, { width: Math.min(track.displayWidth, 1080) });
  const first = await posterSink.getCanvas(t0 + Math.min(0.05, duration / 2));
  if (first) src.posterUrl = await canvasToObjectUrl(first.canvas, 0.9);
  videoSources.set(id, src);
  buildFilmstrip(src, MB, track).catch(err => console.warn('filmstrip', err));
  return src;
}

// Small frames along the whole source, drawn inside the timeline clips.
async function buildFilmstrip(src, MB, track) {
  const n = Math.max(8, Math.min(80, Math.round(src.duration / 0.4)));
  const stamps = Array.from({ length: n }, (_, i) => src.t0 + (i + 0.5) * src.duration / n);
  const sink = new MB.CanvasSink(track, { height: 72 });
  const strip = [];
  for await (const w of sink.canvasesAtTimestamps(stamps)) {
    if (w) strip.push({ t: w.timestamp - src.t0, url: await canvasToObjectUrl(w.canvas, 0.6) });
  }
  src.strip = strip;
  renderVideoPanel();
}

function sourceEl(src) {
  if (!src.el) {
    const el = document.createElement('video');
    el.preload = 'auto';
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.src = src.url;
    el.addEventListener('seeked', () => _schedulePreviewRedraw());
    el.addEventListener('loadeddata', () => _schedulePreviewRedraw());
    videoElHome.appendChild(el);
    src.el = el;
  }
  return src.el;
}

/* ── Import ── */
async function createVideoPhoto(file) {
  try {
    showToast('動画を読み込んでいます…', 1800);
    const src = await registerVideoSource(file, file.name);
    return {
      kind: 'video',
      file: null, url: src.posterUrl,
      filter: 'normal', brightness: 100, contrast: 100,
      frameId: null, offset: { x: 0, y: 0 }, scale: 1.0, rotation: 0,
      bgColor: '#ffffff',
      frameHue: 0, frameSat: 100,
      textStyle: null,
      icons: [],
      texts: [],
      video: {
        uid: newId('v'),
        clips: [{ id: newId('cl_'), srcId: src.id, in: 0, out: src.duration }],
        muted: false,
        volume: 100,
      },
    };
  } catch (err) {
    console.error('video import', err);
    showToast(`「${file.name}」を読み込めませんでした: ${err.message}`, 4500);
    return null;
  }
}

/* ════════════════════════════════════════
   Preview playback
   ════════════════════════════════════════ */
const vplayer = { uid: null, t: 0, playing: false, clipIdx: -1, el: null, raf: 0, selClipId: null };

function activeVideoPhoto() {
  const p = state.photos[state.previewPhotoIdx];
  return isVideoPhoto(p) ? p : null;
}

// Timeline time → clip and the time inside its source.
function locateVideo(p, t) {
  const clips = videoClips(p);
  let start = 0;
  for (let i = 0; i < clips.length; i++) {
    const len = clipLen(clips[i]);
    if (t < start + len || i === clips.length - 1) {
      return { idx: i, clip: clips[i], start, srcT: clips[i].in + Math.min(Math.max(0, t - start), len) };
    }
    start += len;
  }
  return null;
}

// The drawable for the preview's background, or null to fall back to the poster.
function videoFrameFor(photo) {
  if (!isVideoPhoto(photo) || photo !== activeVideoPhoto()) return null;
  syncPlayerToActive();
  const loc = locateVideo(photo, vplayer.t);
  const src = loc && videoSources.get(loc.clip.srcId);
  if (!src) return null;
  const el = sourceEl(src);
  if (!vplayer.playing && !el.seeking && Math.abs(el.currentTime - loc.srcT) > 0.015) {
    // Never ask for the exact end — some decoders show nothing there.
    el.currentTime = Math.min(loc.srcT, Math.max(0, src.duration - 0.5 / VIDEO_FPS));
  }
  return el.readyState >= 2 ? el : null;
}

// A different video became active (switch, removal, undo of a removal) —
// stop playback and start at the beginning.
function syncPlayerToActive() {
  const p = activeVideoPhoto();
  const uid = p?.video.uid || null;
  if (uid === vplayer.uid) return;
  videoPause(false);
  vplayer.uid = uid;
  vplayer.t = 0;
  vplayer.selClipId = null;
}

function applyAudioSettings(el, p) {
  el.muted = !!p.video.muted;
  el.volume = Math.max(0, Math.min(1, (p.video.volume ?? 100) / 100));
}

function startClipAt(p, t) {
  const loc = locateVideo(p, t);
  const src = loc && videoSources.get(loc.clip.srcId);
  if (!src) { videoPause(); return; }
  const el = sourceEl(src);
  if (vplayer.el && vplayer.el !== el) vplayer.el.pause();
  vplayer.clipIdx = loc.idx;
  vplayer.el = el;
  vplayer.t = t;
  applyAudioSettings(el, p);
  el.currentTime = loc.srcT;
  el.play().catch(err => { console.warn('play', err); videoPause(); });
  cancelAnimationFrame(vplayer.raf);
  vplayer.raf = requestAnimationFrame(playTick);
}

function playTick() {
  const p = activeVideoPhoto();
  if (!vplayer.playing || !p || p.video.uid !== vplayer.uid) { videoPause(); return; }
  const clips = videoClips(p);
  const clip = clips[vplayer.clipIdx];
  if (!clip) { videoPause(); return; }
  const start = clipStartOf(p, clip);
  const el = vplayer.el;
  if (!el.seeking) {
    const cur = el.currentTime;
    vplayer.t = start + Math.max(0, Math.min(cur, clip.out) - clip.in);
    if (cur >= clip.out - 0.5 / VIDEO_FPS || el.ended) {
      if (vplayer.clipIdx + 1 < clips.length) {
        startClipAt(p, start + clipLen(clip));
        _schedulePreviewRedraw();
        updateVideoTimeUI();
        return;
      }
      vplayer.t = videoDuration(p);
      videoPause();
      return;
    }
  }
  updateVideoTimeUI();
  _schedulePreviewRedraw();
  vplayer.raf = requestAnimationFrame(playTick);
}

// iOS only lets a video start from a tap. Playing ends at clip boundaries move
// on from a timer, so every video of this post gets one silent start-stop now,
// inside the tap, which lets it play later.
function unlockVideoEls(p) {
  for (const c of videoClips(p)) {
    const src = videoSources.get(c.srcId);
    if (!src || src.unlocked) continue;
    src.unlocked = true;
    const el = sourceEl(src);
    if (el === vplayer.el) continue;
    const wasMuted = el.muted;
    el.muted = true;
    el.play().then(() => { if (el !== vplayer.el || !vplayer.playing) el.pause(); el.muted = wasMuted; })
      .catch(() => { el.muted = wasMuted; src.unlocked = false; });
  }
}

function videoPlay() {
  const p = activeVideoPhoto();
  if (!p) return;
  syncPlayerToActive();
  unlockVideoEls(p);
  if (vplayer.t >= videoDuration(p) - 0.05) vplayer.t = 0;
  vplayer.playing = true;
  startClipAt(p, vplayer.t);
  updateVideoTimeUI();
}

function videoPause(redraw = true) {
  const was = vplayer.playing;
  vplayer.playing = false;
  cancelAnimationFrame(vplayer.raf);
  vplayer.el?.pause();
  updateVideoTimeUI();
  if (redraw && was) _schedulePreviewRedraw();
}

function videoSeek(t) {
  const p = activeVideoPhoto();
  if (!p) return;
  vplayer.t = Math.max(0, Math.min(videoDuration(p), t));
  if (vplayer.playing) startClipAt(p, vplayer.t);
  updateVideoTimeUI();
  _schedulePreviewRedraw();
}

/* ════════════════════════════════════════
   Timeline panel
   ════════════════════════════════════════ */
const videoPanel   = document.getElementById('videoPanel');
const vpTrack      = document.getElementById('vpTrack');
const vpPlayhead   = document.getElementById('vpPlayhead');
const vpPlay       = document.getElementById('vpPlay');
const vpTime       = document.getElementById('vpTime');
const vpSplit      = document.getElementById('vpSplit');
const vpDelete     = document.getElementById('vpDelete');
const vpAdd        = document.getElementById('vpAdd');
const vpAddInput   = document.getElementById('vpAddInput');
const vpMute       = document.getElementById('vpMute');
const vpVolume     = document.getElementById('vpVolume');
const vpVolumeVal  = document.getElementById('vpVolumeVal');

function updateVideoTimeUI() {
  const p = activeVideoPhoto();
  if (!p || videoPanel.hidden) return;
  const total = videoDuration(p);
  vpTime.textContent = `${fmtVideoTime(vplayer.t)} / ${fmtVideoTime(total)}`;
  vpPlayhead.style.left = `${total ? (vplayer.t / total) * 100 : 0}%`;
  vpPlay.textContent = vplayer.playing ? '❚❚' : '▶';
  vpPlay.title = vplayer.playing ? '一時停止（スペース）' : '再生（スペース）';
}

function renderVideoPanel() {
  const p = activeVideoPhoto();
  videoPanel.hidden = !p;
  if (!p) { videoPause(false); vplayer.uid = null; return; }
  syncPlayerToActive();
  const clips = p.video.clips;
  const total = videoDuration(p) || 1;
  if (!clips.some(c => c.id === vplayer.selClipId)) vplayer.selClipId = null;
  vplayer.t = Math.min(vplayer.t, videoDuration(p));

  const trackW = vpTrack.clientWidth || 480;
  vpTrack.innerHTML = '';
  let start = 0;
  for (const clip of clips) {
    const len = clipLen(clip);
    const src = videoSources.get(clip.srcId);
    const el = document.createElement('div');
    el.className = 'vp-clip' + (clip.id === vplayer.selClipId ? ' selected' : '') + (src ? '' : ' missing');
    el.dataset.id = clip.id;
    el.style.left = `${(start / total) * 100}%`;
    el.style.width = `${(len / total) * 100}%`;
    const strip = document.createElement('div');
    strip.className = 'vp-strip';
    if (src?.strip.length) {
      const k = Math.max(1, Math.round((len / total) * trackW / 44));
      for (let i = 0; i < k; i++) {
        const t = clip.in + (i + 0.5) * len / k;
        let best = src.strip[0];
        for (const f of src.strip) if (Math.abs(f.t - t) < Math.abs(best.t - t)) best = f;
        const img = document.createElement('img');
        img.src = best.url;
        img.alt = '';
        img.draggable = false;
        strip.appendChild(img);
      }
    }
    const label = document.createElement('span');
    label.className = 'vp-clip-len';
    label.textContent = src ? `${len.toFixed(1)}秒` : '元の動画がありません';
    const hl = document.createElement('div');
    hl.className = 'vp-handle l'; hl.dataset.side = 'l'; hl.title = 'ドラッグで始まりを調整';
    const hr = document.createElement('div');
    hr.className = 'vp-handle r'; hr.dataset.side = 'r'; hr.title = 'ドラッグで終わりを調整';
    el.append(strip, label, hl, hr);
    vpTrack.appendChild(el);
    start += len;
  }

  vpMute.checked = !!p.video.muted;
  vpVolume.value = p.video.volume ?? 100;
  vpVolumeVal.textContent = p.video.volume ?? 100;
  vpVolume.disabled = !!p.video.muted;
  vpDelete.disabled = clips.length <= 1;
  updateVideoTimeUI();
}

// Any edit to the clip list: redraw everything and record an undo step.
function videoEdited() {
  renderVideoPanel();
  schedulePreviewRedraw();
}

/* ── Pointer: trim / reorder / scrub ── */
let vpDrag = null;
vpTrack.addEventListener('pointerdown', e => {
  const p = activeVideoPhoto();
  if (!p || e.button !== 0) return;
  e.preventDefault();
  vpTrack.setPointerCapture(e.pointerId);
  const rect = vpTrack.getBoundingClientRect();
  const total = videoDuration(p);
  const pps = rect.width / (total || 1);
  const handle = e.target.closest('.vp-handle');
  const clipEl = e.target.closest('.vp-clip');
  const clip = clipEl && p.video.clips.find(c => c.id === clipEl.dataset.id);
  const tAt = x => Math.max(0, Math.min(total, (x - rect.left) / pps));
  if (handle && clip) {
    videoPause();
    vplayer.selClipId = clip.id;
    vpDrag = { mode: handle.dataset.side === 'l' ? 'trimL' : 'trimR', p, clip, x0: e.clientX, in0: clip.in, out0: clip.out, pps };
  } else if (clip) {
    vplayer.selClipId = clip.id;
    vpDrag = { mode: 'body', p, clip, x0: e.clientX, moved: false, rect };
    videoSeek(tAt(e.clientX));
  } else {
    vpDrag = { mode: 'scrub', p, tAt };
    videoSeek(tAt(e.clientX));
  }
  renderVideoPanel();
});

vpTrack.addEventListener('pointermove', e => {
  const d = vpDrag;
  if (!d || d.p !== activeVideoPhoto()) return;
  const dx = e.clientX - (d.x0 ?? e.clientX);
  if (d.mode === 'trimL' || d.mode === 'trimR') {
    const src = videoSources.get(d.clip.srcId);
    const srcDur = src ? src.duration : d.out0;
    if (d.mode === 'trimL') {
      d.clip.in = Math.max(0, Math.min(d.clip.out - MIN_CLIP, d.in0 + dx / d.pps));
      vplayer.t = clipStartOf(d.p, d.clip);
    } else {
      d.clip.out = Math.min(srcDur, Math.max(d.clip.in + MIN_CLIP, d.out0 + dx / d.pps));
      vplayer.t = clipStartOf(d.p, d.clip) + clipLen(d.clip) - 0.5 / VIDEO_FPS;
    }
    videoEdited();
  } else if (d.mode === 'body') {
    if (!d.moved && Math.abs(dx) < 6) return;
    d.moved = true;
    vpTrack.classList.add('reordering');
    const clips = d.p.video.clips;
    const x = e.clientX - d.rect.left;
    // Where the dragged clip goes: after every other clip whose centre is left of the pointer.
    const total = videoDuration(d.p);
    const others = clips.filter(c => c !== d.clip);
    let start = 0, target = 0;
    for (const c of others) {
      const center = ((start + clipLen(c) / 2) / total) * d.rect.width;
      if (x > center) target++;
      start += clipLen(c);
    }
    if (clips.indexOf(d.clip) !== target) {
      others.splice(target, 0, d.clip);
      d.p.video.clips = others;
      vplayer.t = clipStartOf(d.p, d.clip);
      videoEdited();
    }
  } else if (d.mode === 'scrub') {
    videoSeek(d.tAt(e.clientX));
  }
});

const endVpDrag = () => { vpDrag = null; vpTrack.classList.remove('reordering'); };
vpTrack.addEventListener('pointerup', endVpDrag);
vpTrack.addEventListener('pointercancel', endVpDrag);

/* ── Buttons ── */
vpPlay.addEventListener('click', () => (vplayer.playing ? videoPause() : videoPlay()));

vpSplit.addEventListener('click', () => {
  const p = activeVideoPhoto();
  if (!p) return;
  const loc = locateVideo(p, vplayer.t);
  if (!loc) return;
  if (loc.srcT - loc.clip.in < MIN_CLIP || loc.clip.out - loc.srcT < MIN_CLIP) {
    showToast('クリップの端に近すぎます。少し内側で分割してください');
    return;
  }
  videoPause();
  const right = { ...loc.clip, id: newId('cl_'), in: loc.srcT };
  loc.clip.out = loc.srcT;
  p.video.clips.splice(loc.idx + 1, 0, right);
  vplayer.selClipId = right.id;
  videoEdited();
  showToast('分割しました');
});

vpDelete.addEventListener('click', () => {
  const p = activeVideoPhoto();
  if (!p) return;
  const clips = p.video.clips;
  if (clips.length <= 1) { showToast('最後のクリップは削除できません'); return; }
  const clip = clips.find(c => c.id === vplayer.selClipId) || locateVideo(p, vplayer.t)?.clip;
  if (!clip) return;
  videoPause();
  const start = clipStartOf(p, clip);
  p.video.clips = clips.filter(c => c !== clip);
  vplayer.selClipId = null;
  vplayer.t = Math.min(start, videoDuration(p));
  videoEdited();
  showToast('クリップを削除しました');
});

vpAdd.addEventListener('click', () => vpAddInput.click());
vpAddInput.addEventListener('change', async () => {
  const files = [...vpAddInput.files];
  vpAddInput.value = '';
  await addVideosToActive(files);
});

async function addVideosToActive(files) {
  const p = activeVideoPhoto();
  if (!p) return;
  const uid = p.video.uid;
  for (const file of files.filter(isVideoFile)) {
    let src;
    try {
      showToast('動画を読み込んでいます…', 1800);
      src = await registerVideoSource(file, file.name);
    } catch (err) {
      showToast(`「${file.name}」を読み込めませんでした: ${err.message}`, 4500);
      continue;
    }
    const cur = activeVideoPhoto();
    if (!cur || cur.video.uid !== uid) return;   // the user moved on meanwhile
    const clips = cur.video.clips;
    const sel = clips.findIndex(c => c.id === vplayer.selClipId);
    const clip = { id: newId('cl_'), srcId: src.id, in: 0, out: src.duration };
    clips.splice(sel >= 0 ? sel + 1 : clips.length, 0, clip);
    vplayer.selClipId = clip.id;
    vplayer.t = clipStartOf(cur, clip);
    videoEdited();
    showToast('動画をつなげました');
  }
}

vpMute.addEventListener('change', () => {
  const p = activeVideoPhoto();
  if (!p) return;
  p.video.muted = vpMute.checked;
  if (vplayer.el) applyAudioSettings(vplayer.el, p);
  videoEdited();
});
vpVolume.addEventListener('input', () => {
  const p = activeVideoPhoto();
  if (!p) return;
  p.video.volume = +vpVolume.value;
  vpVolumeVal.textContent = vpVolume.value;
  if (vplayer.el) applyAudioSettings(vplayer.el, p);
  schedulePreviewRedraw();
});

// Space = play / pause (not while typing, and only on the editing screen).
window.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (!activeVideoPhoto() || document.getElementById('outputEditing')?.hidden) return;
  if (isEditableTarget(document.activeElement)) return;
  if ([...document.querySelectorAll('.modal-overlay')].some(m => !m.hidden)) return;
  e.preventDefault();
  if (vplayer.playing) videoPause(); else videoPlay();
});

// Keep the panel in step with whatever changes the active image.
{
  const _switch = switchToPhoto;
  switchToPhoto = function (idx) { _switch(idx); renderVideoPanel(); };
  const _thumbs = renderThumbs;
  renderThumbs = function () { _thumbs(); renderVideoPanel(); };
  const _setOutput = setOutput;
  setOutput = function (mode) {
    if (mode !== 'editing') videoPause(false);
    _setOutput(mode);
    if (mode === 'editing') renderVideoPanel();
  };
  window.addEventListener('resize', () => { if (!videoPanel.hidden) renderVideoPanel(); });
}

/* ════════════════════════════════════════
   MP4 export
   ════════════════════════════════════════ */
let aacReady = null;
async function ensureAac(MB) {
  return (aacReady ||= (async () => {
    // Check the exact settings the export uses — Safari and others may lack AAC.
    const cfg = { bitrate: AUDIO_BITRATE, sampleRate: AUDIO_RATE, numberOfChannels: 2 };
    if (await MB.canEncodeAudio('aac', cfg)) return true;
    try {
      const ext = await import('./vendor/mediabunny-aac-encoder.min.js');
      ext.registerAacEncoder();   // handles AAC at these settings (48 kHz, stereo, set bitrate)
      return true;
    } catch (err) {
      console.warn('aac encoder', err);
      return false;
    }
  })());
}

// All clips' sound, cut and joined like the picture, as one AudioBuffer.
async function mixVideoAudio(MB, p, inputs) {
  const total = videoDuration(p);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * AUDIO_RATE)), AUDIO_RATE);
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, (p.video.volume ?? 100) / 100);
  gain.connect(ctx.destination);
  let start = 0, any = false;
  for (const clip of p.video.clips) {
    const src = videoSources.get(clip.srcId);
    const len = clipLen(clip);
    if (src?.hasAudio) {
      const track = await inputs.get(src.id).getPrimaryAudioTrack();
      const sink = new MB.AudioBufferSink(track);
      const a = clip.in + src.t0, b = clip.out + src.t0;
      for await (const w of sink.buffers(a, b)) {
        const from = Math.max(w.timestamp, a);
        const until = Math.min(w.timestamp + w.duration, b);
        if (until <= from) continue;
        const node = ctx.createBufferSource();
        node.buffer = w.buffer;
        node.connect(gain);
        node.start(start + (from - a), from - w.timestamp, until - from);
        any = true;
      }
    }
    start += len;
  }
  return any ? ctx.startRendering() : null;
}

// Renders one video post: every frame of the cut, with the frame and all
// layers drawn on top. Returns the MP4 and a still of the first frame.
async function renderVideoPost(photo, frame, onProgress = () => {}) {
  const MB = await loadMediabunny();
  const cfg = frame?.config || {};
  const W = cfg.canvasWidth || 1080;
  const H = cfg.canvasHeight || 1350;
  const clips = photo.video.clips.filter(c => videoSources.has(c.srcId) && clipLen(c) > 0);
  if (!clips.length) throw new Error('元の動画が見つかりません');
  const p = { ...photo, video: { ...photo.video, clips } };

  // Everything above the video never changes — draw it once.
  const layers = await compositeImageFor(photo, frame, { layersOnly: true });

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const inputs = new Map();
  for (const c of clips) if (!inputs.has(c.srcId)) inputs.set(c.srcId, await openVideoInput(videoSources.get(c.srcId).blob));

  const output = new MB.Output({
    format: new MB.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new MB.BufferTarget(),
  });
  const videoOut = new MB.CanvasSource(canvas, { codec: 'avc', bitrate: VIDEO_BITRATE, keyFrameInterval: 2 });
  output.addVideoTrack(videoOut, { frameRate: VIDEO_FPS });

  let audioBuffer = null, audioOut = null, audioNote = '';
  if (!photo.video.muted && (photo.video.volume ?? 100) > 0 && clips.some(c => videoSources.get(c.srcId).hasAudio)) {
    if (await ensureAac(MB)) {
      audioBuffer = await mixVideoAudio(MB, p, inputs);
      if (audioBuffer) {
        audioOut = new MB.AudioBufferSource({ codec: 'aac', bitrate: AUDIO_BITRATE });
        output.addAudioTrack(audioOut);
      }
    } else {
      audioNote = 'このブラウザでは音声を書き出せないため、音なしで保存しました';
    }
  }

  await output.start();
  const total = videoDuration(p);
  const frameCount = Math.max(1, Math.round(total * VIDEO_FPS));
  let n = 0, still = null, start = 0;
  for (const clip of clips) {
    const src = videoSources.get(clip.srcId);
    const track = await inputs.get(src.id).getPrimaryVideoTrack();
    const fit = Math.min(1, 1920 / Math.max(track.displayWidth, track.displayHeight));
    const sink = new MB.CanvasSink(track, { width: Math.max(2, Math.round(track.displayWidth * fit / 2) * 2), poolSize: 2 });
    const end = start + clipLen(clip);
    const stamps = [];
    for (let k = n; k < frameCount && (k + 0.5) / VIDEO_FPS < end; k++) {
      stamps.push(src.t0 + clip.in + Math.max(0, k / VIDEO_FPS - start));
    }
    let last = null;
    for await (const w of sink.canvasesAtTimestamps(stamps)) {
      if (w) last = w.canvas;
      drawPhotoLayer(ctx, photo, last, W, H, 1);
      ctx.drawImage(layers, 0, 0);
      if (!still) still = canvas.toDataURL('image/jpeg', 0.92);
      await videoOut.add(n / VIDEO_FPS, 1 / VIDEO_FPS);
      n++;
      if (n % 5 === 0) onProgress(n / frameCount);
    }
    start = end;
  }
  if (audioOut) await audioOut.add(audioBuffer);
  await output.finalize();
  onProgress(1);
  for (const input of inputs.values()) input.dispose?.();
  return {
    blob: new Blob([output.target.buffer], { type: 'video/mp4' }),
    stillDataUrl: still || canvas.toDataURL('image/jpeg', 0.92),
    duration: n / VIDEO_FPS,
    audioNote,
  };
}

/* ════════════════════════════════════════
   Project files (Mac app)
   ════════════════════════════════════════ */
function usedVideoSourceIds() {
  const ids = new Set();
  for (const p of state.photos) for (const c of videoClips(p)) if (videoSources.has(c.srcId)) ids.add(c.srcId);
  return [...ids];
}
const videoFileName = src => `${src.id}.${(src.name.match(/\.(\w+)$/) || [, 'mp4'])[1].toLowerCase()}`;

// For the bundle: metadata for the .tak plus the files to write under videos/.
async function collectVideoSources() {
  const meta = [], files = [];
  for (const id of usedVideoSourceIds()) {
    const src = videoSources.get(id);
    const name = videoFileName(src);
    meta.push({ id, name: src.name, videoFile: `videos/${name}` });
    files.push({ name, bytes: new Uint8Array(await src.blob.arrayBuffer()) });
  }
  return { meta, files };
}

// Opening a project: `bytesById` comes from the main process (videos/ folder).
async function restoreVideoSources(meta = [], bytesById = {}) {
  for (const m of meta) {
    const bytes = bytesById?.[m.id];
    if (!bytes || videoSources.has(m.id)) continue;
    const type = /\.mov$/i.test(m.name || '') ? 'video/quicktime' : 'video/mp4';
    try {
      await registerVideoSource(new Blob([bytes], { type }), m.name, m.id);
    } catch (err) {
      console.warn('restore video', m.name, err);
    }
  }
}
