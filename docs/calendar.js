/* ── 営業日カレンダー ──
   Turns the director's Apotool screenshot into the monthly opening-days post (1080×1350).
   Colours are read from the pixels, which is exact; Gemini only reads the title (year/month)
   and the 日毎メモ, from small crops of the screenshot rather than the whole screen. */
(() => {
  'use strict';

  const CANVAS_W = 1080, CANVAS_H = 1350;
  const STATUS = {
    open: '診療日',
    afternoonClosed: '午後休診',
    closed: '休診',
    morningClosed: '午前休診（午後のみ診療）',
  };
  const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
  const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December'];
  const COLOR = {
    pink: '#FFCFD2', lime: '#CFDA00', ink: '#4E4E4E', dayNumber: '#6E6E6E',
    saturday: '#6FA8B2', sunday: '#D2555F', gridLine: '#C4C4C4', beige: '#CBB98A',
  };
  /* The same post text returns every year; only the calendar image changes. */
  const CAPTION_TAGS = "#旭川歯科医院 #旭川歯医者 #神楽岡 #旭川空港 #旭川インプラント #ホワイトニング #インプラント治療 #旭川美容 #医療ホワイトニング #歯ブラシ #歯みがき #インプラント相談 #歯周外科治療 #旭川";
  const CAPTIONS = [
    "新年あけましておめでとうございます。今年も歯の健康を通じて皆様の笑顔をサポートします。今月の診療日をカレンダーでご確認ください。",
    "寒さもあと少し。バレンタインに向けて、口元のケアはいかがですか？変則的な診療日がありますので、カレンダーをお確かめください。",
    "春はもう目の前です。卒業・入学シーズンに備えて、歯の健康管理をしましょう。今月も診療カレンダーをご覧いただき、ご予約をお待ちしております。",
    "新しい年度が始まりました。笑顔あふれる一年になりますよう、歯のケアもお手伝いします。今月の休診日は投稿カレンダーをご確認ください。",
    "🌿風薫る5月、外を歩くのが気持ちいい季節ですね☀️新生活にも少しずつ慣れてきた頃でしょうか？たかはし歯科の【5月の診療スケジュール】をお知らせします📅お口のメンテナンス、そろそろ行こうかな？という方も、お気軽にどうぞ🦷連休明けはご予約が混み合うこともあるため、お早めのご連絡をおすすめいたします📞🌷",
    "雨の日こそ、ゆったり歯科検診はいかがでしょう？今月は特別な休診日がありますので、ご確認ください。健康な歯で、梅雨を元気に乗り切りましょう！",
    "暑さ本番！冷たいものが沁みませんか？早めのケアで快適な夏をお過ごしください。休診日はカレンダーをご覧ください。スタッフ一同、お待ちしております。",
    "夏休みシーズン到来です。お子さまの歯科検診もお忘れなく！今月はお盆期間に休診日がございますので、診療日の確認をお願いいたします。",
    "季節の変わり目、歯とお口のチェックは大丈夫ですか？秋の美味しい食事を楽しむためにも、診療カレンダーをご確認のうえ、ご予約ください。",
    "食欲の秋がやってきました。美味しく食べるために、歯の健康管理もお忘れなく。変則的な休診日がありますので、カレンダーをご参照ください。",
    "寒さが増すこの季節、体調管理はお口から。冬本番前に歯のメンテナンスをしておきませんか？休診日は投稿カレンダーでご確認を。",
    "今年もあとわずか。年末年始を気持ちよく迎えるために、歯のチェックはお早めに。休診日は特にご注意ください。健康な笑顔で新年を！",
  ];
  const GRID = { x: 100, y: 268, w: 880, h: 900 };
  const FRAME = 40, FOOTER_H = 140, DOT = 68, LEGEND_DOT = 50;
  // Cormorant Garamond matches past posts when it's installed or added under 設定.
  const serif = (px) => `500 ${px}px "Cormorant Garamond", Baskerville, serif`;
  const sans = (px) => `300 ${px}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif`;

  /* ── Dates (UTC arithmetic, so the local timezone never shifts a day) ── */
  const weekdayOf = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const keyOf = (date) => dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  const monthKey = (m) => `${m.year}-${pad(m.month)}`;
  const shiftMonth = ({ year, month }, by) => {
    const d = new Date(Date.UTC(year, month - 1 + by, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  };

  /* ── Japanese holidays: rule-based, overlaid with the holidays-jp feed when online ── */
  function calculatedHolidays(year) {
    const nthMonday = (month, n) => 1 + (8 - weekdayOf(year, month, 1)) % 7 + (n - 1) * 7;
    const sinceBase = year - 1980, drift = Math.floor(sinceBase / 4);
    const spring = Math.floor(20.8431 + 0.242194 * sinceBase - drift);
    const autumn = Math.floor(23.2488 + 0.242194 * sinceBase - drift);
    const h = {
      [dateKey(year, 1, 1)]: '元日',
      [dateKey(year, 1, nthMonday(1, 2))]: '成人の日',
      [dateKey(year, 2, 11)]: '建国記念の日',
      [dateKey(year, 2, 23)]: '天皇誕生日',
      [dateKey(year, 3, spring)]: '春分の日',
      [dateKey(year, 4, 29)]: '昭和の日',
      [dateKey(year, 5, 3)]: '憲法記念日',
      [dateKey(year, 5, 4)]: 'みどりの日',
      [dateKey(year, 5, 5)]: 'こどもの日',
      [dateKey(year, 7, nthMonday(7, 3))]: '海の日',
      [dateKey(year, 8, 11)]: '山の日',
      [dateKey(year, 9, nthMonday(9, 3))]: '敬老の日',
      [dateKey(year, 9, autumn)]: '秋分の日',
      [dateKey(year, 10, nthMonday(10, 2))]: 'スポーツの日',
      [dateKey(year, 11, 3)]: '文化の日',
      [dateKey(year, 11, 23)]: '勤労感謝の日',
    };
    const named = Object.keys(h).sort();
    const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    const DAY = 86400000;
    // 国民の休日: a weekday sandwiched between two holidays.
    for (const k of named) {
      const next = new Date(parse(k) + DAY), after = new Date(parse(k) + 2 * DAY);
      if (!h[keyOf(next)] && h[keyOf(after)] && next.getUTCDay() !== 0) h[keyOf(next)] = '国民の休日';
    }
    // 振替休日: a Sunday holiday moves to the next day that isn't already one.
    for (const k of named) {
      if (new Date(parse(k)).getUTCDay() !== 0) continue;
      let t = parse(k) + DAY;
      while (h[keyOf(new Date(t))]) t += DAY;
      h[keyOf(new Date(t))] = '振替休日';
    }
    return h;
  }

  let holidayFeed = {};
  const holidays = (year) => ({
    ...calculatedHolidays(year - 1), ...calculatedHolidays(year), ...calculatedHolidays(year + 1),
    ...holidayFeed,
  });

  async function refreshHolidayFeed() {
    try {
      const r = await fetch('https://holidays-jp.github.io/api/v1/date.json', { signal: AbortSignal.timeout(6000) });
      if (r.ok) holidayFeed = await r.json();
    } catch { /* Offline: the calculated holidays still apply. */ }
  }

  /* ── Clinic rules: 日祝 休み / 土 午前のみ / 平日は Apotool の表示どおり ──
     赤・青の付いていない平日は終日診療として扱う。公式サイトの木曜の案内より Apotool を優先する（院長確認済み）。 */

  function baseStatus({ year, month }, day, table) {
    if (table[dateKey(year, month, day)]) return 'closed';
    switch (weekdayOf(year, month, day)) {
      case 0: return 'closed';
      case 6: return 'afternoonClosed';
      default: return 'open';
    }
  }

  function autoStatus(m, day, data, table) {
    const base = baseStatus(m, day, table);
    if (table[dateKey(m.year, m.month, day)]) return base; // A holiday stays closed unless overridden.
    switch (data.marks[day]) {
      case 'red': return 'closed';
      case 'blue': return 'afternoonClosed';
      case 'selected': return data.selectedDayHint || base;
      default: return base;
    }
  }

  const dayStatus = (m, day, data, table) => data.overrides[day] || autoStatus(m, day, data, table);
  const daysNeedingReview = (data) => Object.keys(data.marks)
    .filter((d) => data.marks[d] === 'selected' && !data.overrides[d]).map(Number).sort((a, b) => a - b);

  function memoStatus(memo) {
    if (memo.includes('午前休診')) return 'morningClosed';
    if (memo.includes('午後休診')) return 'afternoonClosed';
    if (memo.includes('休診')) return 'closed';
    return null;
  }

  /* ── Reading the Apotool month grid from pixels ──
     Finds the coloured day pills rather than assuming positions, which vary by device and
     crop. Sundays and Saturdays are always coloured, so the outer pills fix the seven
     columns and the Sunday pills fix the rows; a cell with no pill is an ordinary day. */
  function classify(r, g, b) {
    // Measured from Apotool: red #FFE5E4, blue #E5F1FF, selected #3952A4.
    if (r >= 245 && g >= 205 && g <= 240 && b >= 205 && b <= 240 && r - g >= 14) return 1;
    if (b >= 245 && r >= 205 && r <= 238 && b - r >= 14) return 2;
    if (r < 100 && g < 120 && b >= 130 && b - r >= 60) return 3;
    return 0;
  }
  const MARK = [null, 'red', 'blue', 'selected'];

  function findPills(px, width, height) {
    const labels = new Uint8Array(width * height);
    for (let i = 0; i < labels.length; i++) labels[i] = classify(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    const pills = [];
    for (let start = 0; start < labels.length; start++) {
      const code = labels[start];
      if (!code) continue;
      let minX = width, maxX = 0, minY = height, maxY = 0, area = 0;
      const stack = [start];
      labels[start] = 0;
      while (stack.length) {
        const i = stack.pop(), x = i % width, y = (i - x) / width;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        area++;
        for (const n of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1]) {
          if (n >= 0 && labels[n] === code) { labels[n] = 0; stack.push(n); }
        }
      }
      const w = maxX - minX + 1, h = maxY - minY + 1;
      // A pill: wider than tall, and a sizeable fraction of a seventh of the width.
      if (w / h > 1.2 && w / h < 2.4 && w > width / 14 && area > w * h * 0.4) {
        pills.push({ midX: minX + w / 2, midY: minY + h / 2, width: w, mark: MARK[code] });
      }
    }
    return pills;
  }

  function buildGrid(pills) {
    if (pills.length < 8) return null;
    const medianWidth = pills.map((p) => p.width).sort((a, b) => a - b)[pills.length >> 1];
    const sized = pills.filter((p) => Math.abs(p.width - medianWidth) < medianWidth * 0.25);
    if (!sized.length) return null;
    const left = Math.min(...sized.map((p) => p.midX));
    const right = Math.max(...sized.map((p) => p.midX));
    const columnPitch = (right - left) / 6;
    if (columnPitch <= medianWidth * 0.8) return null;

    const rows = sized.filter((p) => Math.abs(p.midX - left) < columnPitch / 2)
      .map((p) => p.midY).sort((a, b) => a - b);
    if (rows.length < 4 || rows.length > 6) return null;
    const gaps = rows.slice(1).map((y, i) => y - rows[i]).sort((a, b) => a - b);
    const rowPitch = gaps[(gaps.length - 1) >> 1];

    const cells = {};
    for (const p of sized) {
      const column = Math.round((p.midX - left) / columnPitch);
      const row = rows.findIndex((y) => Math.abs(y - p.midY) < rowPitch / 2);
      if (row >= 0 && column >= 0 && column <= 6) cells[`${row},${column}`] = p.mark;
    }
    return { cells, rowCount: rows.length, firstRowY: rows[0], lastRowY: rows[rows.length - 1], rowPitch };
  }

  function marksForMonth(grid, { year, month }) {
    const offset = weekdayOf(year, month, 1), marks = {};
    for (let day = 1; day <= daysIn(year, month); day++) {
      const index = offset + day - 1;
      const mark = grid.cells[`${Math.floor(index / 7)},${index % 7}`];
      if (mark) marks[day] = mark;
    }
    return marks;
  }

  function cropToJpeg(source, y0, y1) {
    const sy = Math.max(0, Math.round(y0));
    const sh = Math.min(source.height, Math.round(y1)) - sy;
    if (sh <= 0) return null;
    const c = document.createElement('canvas');
    c.width = source.width; c.height = sh;
    c.getContext('2d').drawImage(source, 0, sy, source.width, sh, 0, 0, source.width, sh);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }

  async function readScreenshot(blob) {
    const bitmap = await createImageBitmap(blob);
    const width = Math.min(bitmap.width, 600);
    const height = Math.round(bitmap.height * width / bitmap.width);
    const small = document.createElement('canvas');
    small.width = width; small.height = height;
    const ctx = small.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const grid = buildGrid(findPills(ctx.getImageData(0, 0, width, height).data, width, height));
    if (!grid) throw new Error('カレンダーを見つけられませんでした。Apotoolの月カレンダー全体が写ったスクリーンショットを選んでください。');

    // Only the month title, plus the 日毎メモ when a focused day makes it necessary, leave
    // the Mac: the rest of the screen stays out of what's sent to Gemini's free tier.
    const scale = bitmap.width / width;
    const toFull = (y) => y * scale;
    const hasSelected = Object.values(grid.cells).includes('selected');
    const titleImage = cropToJpeg(bitmap, toFull(grid.firstRowY - 2.5 * grid.rowPitch), toFull(grid.firstRowY - 1.3 * grid.rowPitch));
    const memoImage = hasSelected
      ? cropToJpeg(bitmap, toFull(grid.lastRowY + 2.3 * grid.rowPitch), toFull(grid.lastRowY + 6.2 * grid.rowPitch))
      : null;
    bitmap.close();

    let text = {};
    try {
      const r = await fetch('/api/calendar/read-text', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleImage, memoImage }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      text = body;
    } catch (err) {
      text = { error: err.message };
    }
    return { grid, text };
  }

  /* ── Rendering ── */
  const rowCount = ({ year, month }) =>
    Math.ceil((((weekdayOf(year, month, 1) + 6) % 7) + daysIn(year, month)) / 7);

  function cellRect(row, column, rows) {
    const w = GRID.w / 7, h = GRID.h / rows;
    return { x: GRID.x + column * w, y: GRID.y + row * h, w, h };
  }

  function dayRect(m, day) {
    const index = ((weekdayOf(m.year, m.month, 1) + 6) % 7) + day - 1;
    return cellRect(Math.floor(index / 7), index % 7, rowCount(m));
  }

  function dayAt(m, x, y) {
    for (let day = 1; day <= daysIn(m.year, m.month); day++) {
      const r = dayRect(m, day);
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return day;
    }
    return null;
  }

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const assets = {};
  async function loadAssets() {
    if (assets.ready) return;
    const svg = document.querySelector('.header-logo svg').outerHTML;
    assets.mark = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    assets.wordmark = await loadImage('calendar-typo.png');
    assets.ready = true;
  }

  function drawText(ctx, text, font, color, x, baseline, tracking = 0) {
    ctx.font = font; ctx.fillStyle = color; ctx.letterSpacing = `${tracking}px`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, baseline);
    const end = x + ctx.measureText(text).width;
    ctx.letterSpacing = '0px';
    return end;
  }

  function drawCentered(ctx, text, font, color, cx, baseline, tracking = 0) {
    ctx.font = font; ctx.letterSpacing = `${tracking}px`;
    const w = ctx.measureText(text).width;
    ctx.letterSpacing = '0px';
    drawText(ctx, text, font, color, cx - w / 2, baseline, tracking);
  }

  function drawLines(ctx, lines, font, x, centerY, align, px) {
    const lh = px * 1.2;
    ctx.font = font; ctx.fillStyle = '#000'; ctx.textAlign = align; ctx.textBaseline = 'middle';
    lines.forEach((line, i) => ctx.fillText(line, x, centerY + (i - (lines.length - 1) / 2) * lh));
  }

  function drawDot(ctx, status, cx, cy, d) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = status === 'closed' ? COLOR.lime : COLOR.pink;
    ctx.fillRect(cx - d / 2, cy - d / 2, d, d);
    if (status === 'afternoonClosed') {
      ctx.fillStyle = COLOR.lime;
      ctx.fillRect(cx - d / 2, cy, d, d / 2);
    }
    ctx.restore();
  }

  function drawWordmark(ctx) {
    const img = assets.wordmark, w = 640, h = w * img.height / img.width;
    const x = (CANVAS_W - w) / 2, y = CANVAS_H - FOOTER_H + (FOOTER_H - h) / 2;
    // The bundled artwork's "Tak Dental Hokkaido" is white; on the posts it's beige.
    const split = 700 / 911, sx = Math.round(img.width * split), sw = img.width - sx;
    ctx.drawImage(img, 0, 0, sx, img.height, x, y, w * split, h);
    const tint = document.createElement('canvas');
    tint.width = sw; tint.height = img.height;
    const t = tint.getContext('2d');
    t.drawImage(img, sx, 0, sw, img.height, 0, 0, sw, img.height);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = COLOR.beige;
    t.fillRect(0, 0, sw, img.height);
    ctx.drawImage(tint, x + w * split, y, w * (1 - split), h);
  }

  function splitInTwo(text) {
    const chars = [...text];
    if (chars.length <= 2) return [text];
    const mid = Math.ceil(chars.length / 2);
    return [chars.slice(0, mid).join(''), chars.slice(mid).join('')];
  }

  function render(canvas, m, data, table, morningText) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = COLOR.pink;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#fff';
    ctx.fillRect(FRAME, FRAME, CANVAS_W - FRAME * 2, CANVAS_H - FRAME - FOOTER_H);

    const markH = 92, markW = markH * 407.28 / 460.76;
    ctx.drawImage(assets.mark, CANVAS_W - markW - 20, 22, markW, markH);
    drawWordmark(ctx);

    // Header
    let x = drawText(ctx, String(m.month), serif(150), COLOR.ink, GRID.x, 186) + 26;
    ctx.strokeStyle = COLOR.ink; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, 160); ctx.lineTo(x + 18, 112); ctx.stroke();
    x += 46;
    drawText(ctx, String(m.year), serif(44), COLOR.ink, x, 132, 5);
    drawText(ctx, MONTH_EN[m.month - 1], serif(52), COLOR.ink, x, 184, 3);

    // Legend
    const ly = 150, d = LEGEND_DOT;
    drawDot(ctx, 'closed', 925 - d / 2 - 8, ly, d);
    drawLines(ctx, ['休診'], sans(22), 925, ly, 'left', 22);
    drawDot(ctx, 'afternoonClosed', 800 - d / 2 - 8, ly, d);
    drawLines(ctx, ['午後', '休診'], sans(22), 800, ly, 'left', 22);
    drawDot(ctx, 'open', 660 - d / 2 - 8, ly, d);
    drawLines(ctx, ['診療日'], sans(22), 660, ly, 'left', 22);

    // Grid
    const rows = rowCount(m);
    ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((name, column) => {
      const c = cellRect(0, column, rows);
      const color = column === 5 ? COLOR.saturday : column === 6 ? COLOR.sunday : COLOR.dayNumber;
      drawCentered(ctx, name, serif(27), color, c.x + c.w / 2, 248, 2);
    });
    ctx.strokeStyle = COLOR.gridLine; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let c = 0; c <= 7; c++) { const gx = GRID.x + c * GRID.w / 7; ctx.moveTo(gx, GRID.y); ctx.lineTo(gx, GRID.y + GRID.h); }
    for (let r = 0; r <= rows; r++) { const gy = GRID.y + r * GRID.h / rows; ctx.moveTo(GRID.x, gy); ctx.lineTo(GRID.x + GRID.w, gy); }
    ctx.stroke();

    for (let day = 1; day <= daysIn(m.year, m.month); day++) {
      const c = dayRect(m, day), wd = weekdayOf(m.year, m.month, day);
      const isHoliday = !!table[dateKey(m.year, m.month, day)];
      const color = isHoliday || wd === 0 ? COLOR.sunday : wd === 6 ? COLOR.saturday : COLOR.dayNumber;
      drawText(ctx, String(day), serif(38), color, c.x + 12, c.y + 42, 1);

      const numberBottom = 50, cx = c.x + c.w / 2 + 8, cy = c.y + numberBottom + (c.h - numberBottom) / 2 - 2;
      const status = dayStatus(m, day, data, table);
      if (status === 'morningClosed') drawLines(ctx, splitInTwo(morningText), sans(24), cx, cy, 'center', 24);
      else drawDot(ctx, status, cx, cy, DOT);
    }
  }

  /* ── Screen ── */
  const $ = (id) => document.getElementById(id);
  const now = new Date(Date.now() + 9 * 3600000); // Japan time
  const ui = {
    month: { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 },
    months: {},
    morningText: '午後診療',
    table: {},
    editingDay: null,
    thumbUrl: null,
  };
  const emptyData = () => ({ marks: {}, overrides: {}, selectedDayHint: null });
  const data = () => (ui.months[monthKey(ui.month)] ||= emptyData());

  const save = () => fetch('/api/calendar', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ months: ui.months, morningClosedText: ui.morningText }),
  }).catch(() => {});

  const dayTitle = (day) =>
    `${ui.month.month}月${day}日（${WEEKDAY_JA[weekdayOf(ui.month.year, ui.month.month, day)]}）`;

  function refresh() {
    ui.table = holidays(ui.month.year);
    closeDayMenu();
    render($('calCanvas'), ui.month, data(), ui.table, ui.morningText);
    $('calMonthLabel').textContent = `${ui.month.year}年${ui.month.month}月`;
    // Only on a month change, so other redraws don't discard edits made before copying.
    if (ui.captionMonth !== ui.month.month) {
      ui.captionMonth = ui.month.month;
      $('calCaption').value = `${CAPTIONS[ui.month.month - 1]}\n${CAPTION_TAGS}`;
      $('calCopied').textContent = '';
    }

    const inMonth = [];
    for (let d = 1; d <= daysIn(ui.month.year, ui.month.month); d++) {
      const name = ui.table[dateKey(ui.month.year, ui.month.month, d)];
      if (name) inMonth.push(`${d}日 ${name}`);
    }
    $('calHolidays').textContent = inMonth.length ? `今月の祝日：${inMonth.join('、')}` : '今月の祝日：なし';

    const review = $('calReview');
    review.replaceChildren(...daysNeedingReview(data()).map((day) => {
      const b = document.createElement('button');
      b.className = 'cal-notice';
      b.type = 'button';
      const how = data().selectedDayHint
        ? `日毎メモから「${STATUS[dayStatus(ui.month, day, data(), ui.table)]}」と判断しました。`
        : '基本の診療時間で仮置きしています。';
      b.innerHTML = `<strong>${dayTitle(day)}を確認してください</strong><span>Apotoolで選択中の日は色が読めません。${how}タップして確定</span>`;
      b.addEventListener('click', () => openDayMenu(day));
      return b;
    }));
  }

  /** Warns when the screenshot looks like a different month from the one being made. */
  function monthWarning(grid) {
    const { year, month } = ui.month;
    const expected = Math.ceil((weekdayOf(year, month, 1) + daysIn(year, month)) / 7);
    if (grid.rowCount !== expected) {
      return `スクショは${grid.rowCount}行ですが、${month}月は${expected}行のはずです。月が合っているか確認してください。`;
    }
    const marks = data().marks;
    for (let d = 1; d <= daysIn(year, month); d++) {
      if (ui.table[dateKey(year, month, d)] && !marks[d]) {
        return `${month}/${d}（祝日）がスクショでは赤くありません。月が合っているか確認してください。`;
      }
    }
    return '';
  }

  async function loadScreenshot(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const summary = $('calSummary'), warning = $('calWarning');
    summary.textContent = '読み取り中…';
    warning.textContent = '';
    if (ui.thumbUrl) URL.revokeObjectURL(ui.thumbUrl);
    ui.thumbUrl = URL.createObjectURL(file);
    $('calThumb').src = ui.thumbUrl;
    $('calThumb').hidden = false;
    try {
      const { grid, text } = await readScreenshot(file);
      const detected = Number.isInteger(text.year) && text.month >= 1 && text.month <= 12;
      if (detected) ui.month = { year: text.year, month: text.month };
      ui.months[monthKey(ui.month)] = {
        marks: marksForMonth(grid, ui.month), overrides: {},
        selectedDayHint: memoStatus(text.memo || ''),
      };
      save();
      refresh();
      const count = (mark) => Object.values(data().marks).filter((v) => v === mark).length;
      summary.textContent = `${ui.month.year}年${ui.month.month}月として読み取りました：赤${count('red')}日・青${count('blue')}日`;
      warning.textContent = detected
        ? monthWarning(grid)
        : `年月を自動で読めませんでした（${text.error || '読み取り不可'}）。表示中の月として処理したので、合っているか確認してください。${monthWarning(grid)}`;
    } catch (err) {
      summary.textContent = '';
      warning.textContent = err.message;
    }
  }

  function closeDayMenu() {
    ui.editingDay = null;
    $('calDayMenu').hidden = true;
  }

  function openDayMenu(day) {
    ui.editingDay = day;
    const menu = $('calDayMenu'), r = dayRect(ui.month, day), current = dayStatus(ui.month, day, data(), ui.table);
    menu.replaceChildren();
    const title = document.createElement('div');
    title.className = 'cal-menu-title';
    title.textContent = dayTitle(day);
    menu.append(title);
    const add = (label, action, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.className = cls;
      b.addEventListener('click', () => { action(); save(); refresh(); });
      menu.append(b);
    };
    for (const [status, label] of Object.entries(STATUS)) {
      add(status === current ? `✓ ${label}` : label, () => { data().overrides[day] = status; });
    }
    if (data().overrides[day]) add('自動判定に戻す', () => { delete data().overrides[day]; }, 'cal-menu-reset');
    menu.style.left = `${Math.min(68, Math.max(0, (r.x + r.w / 2) / CANVAS_W * 100 - 16))}%`;
    menu.style.top = `${Math.min(62, (r.y + r.h) / CANVAS_H * 100)}%`;
    menu.hidden = false;
  }

  async function openCalendar() {
    await loadAssets();
    try {
      const saved = await (await fetch('/api/calendar')).json();
      ui.months = saved.months || {};
      ui.morningText = saved.morningClosedText || '午後診療';
    } catch { /* Start empty. */ }
    $('calMorningText').value = ui.morningText;
    $('calendarModal').hidden = false;
    refresh();
    await refreshHolidayFeed();
    refresh();
  }

  function init() {
    const canvas = $('calCanvas'), input = $('calFile'), modal = $('calendarModal'), drop = $('calDrop');
    $('btnCalendar').addEventListener('click', openCalendar);
    $('calClose').addEventListener('click', () => { modal.hidden = true; });
    const stepMonth = (by) => {
      ui.month = shiftMonth(ui.month, by);
      // These describe the last screenshot, which belongs to the month just left.
      $('calSummary').textContent = '';
      $('calWarning').textContent = '';
      $('calThumb').hidden = true;
      refresh();
    };
    $('calPrev').addEventListener('click', () => stepMonth(-1));
    $('calNext').addEventListener('click', () => stepMonth(1));

    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { loadScreenshot(input.files[0]); input.value = ''; });
    for (const type of ['dragover', 'dragenter']) {
      modal.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('over'); });
    }
    modal.addEventListener('dragleave', (e) => { if (e.target === modal) drop.classList.remove('over'); });
    modal.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      loadScreenshot(e.dataTransfer.files[0]);
    });
    document.addEventListener('paste', (e) => {
      if (modal.hidden) return;
      const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
      if (item) loadScreenshot(item.getAsFile());
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || modal.hidden) return;
      if (ui.editingDay) closeDayMenu(); else modal.hidden = true;
    });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const day = dayAt(ui.month, (e.clientX - rect.left) * CANVAS_W / rect.width, (e.clientY - rect.top) * CANVAS_H / rect.height);
      if (day) openDayMenu(day); else closeDayMenu();
    });

    $('calMorningText').addEventListener('input', (e) => {
      ui.morningText = e.target.value.trim() || '午後診療';
      save();
      refresh();
    });

    $('calCopy').addEventListener('click', async () => {
      const box = $('calCaption');
      try {
        await navigator.clipboard.writeText(box.value);
      } catch {
        box.select();
        document.execCommand('copy');
      }
      $('calCopied').textContent = 'コピーしました';
    });

    $('calExport').addEventListener('click', () => {
      canvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `たかはし歯科_診療カレンダー_${monthKey(ui.month)}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }, 'image/png');
    });
  }

  init();
})();
