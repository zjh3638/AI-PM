// Timeline geometry helpers for the meeting big-screen milestone axis.
// Ports the prototype's pure-JS positioning (bsPct / bsRenderAxis) to typed TS.

export type Gran = 'week' | 'month' | 'quarter';

export interface Win {
  start: Date;
  end: Date;
}

export interface AxisTick {
  pos: number; // percent along the track (0-100)
  top: string; // e.g. "W20" / "5月" / "Q2"
  bot: string; // e.g. "5/12" / "2026"
  current: boolean;
}

const DAY = 86400000;

function parseDate(s: string): Date {
  // treat ISO date (YYYY-MM-DD) as local midnight
  return new Date(s + (s.length === 10 ? 'T00:00:00' : ''));
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7; // Monday = 0
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}

function isoWeekNo(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fd = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fd + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * DAY));
}

/**
 * Build the visible window for a granularity, aligned+padded around the data
 * bounds so the axis ticks land tidily. Falls back to a today-centered window
 * when the data has no dates.
 */
export function buildWindow(
  windowStart: string | null,
  windowEnd: string | null,
  gran: Gran,
  today: Date,
): Win {
  const ds = windowStart ? parseDate(windowStart) : new Date(today.getTime() - 30 * DAY);
  const de = windowEnd ? parseDate(windowEnd) : new Date(today.getTime() + 30 * DAY);
  // include today in-window
  const lo = new Date(Math.min(ds.getTime(), today.getTime()));
  const hi = new Date(Math.max(de.getTime(), today.getTime()));

  if (gran === 'week') {
    const start = startOfWeek(new Date(lo.getTime() - 7 * DAY));
    const end = startOfWeek(new Date(hi.getTime() + 14 * DAY));
    return { start, end };
  }
  if (gran === 'month') {
    const start = new Date(lo.getFullYear(), lo.getMonth() - 1, 1);
    const end = new Date(hi.getFullYear(), hi.getMonth() + 2, 1);
    return { start, end };
  }
  // quarter
  const qs = Math.floor(lo.getMonth() / 3) * 3;
  const qe = Math.floor(hi.getMonth() / 3) * 3;
  const start = new Date(lo.getFullYear(), qs, 1);
  const end = new Date(hi.getFullYear(), qe + 3, 1);
  return { start, end };
}

/** Percent (0-100) of a date across the window. */
export function pct(dateStr: string | null | undefined, win: Win): number {
  if (!dateStr) return 0;
  const d = parseDate(dateStr);
  const p = ((d.getTime() - win.start.getTime()) / (win.end.getTime() - win.start.getTime())) * 100;
  return Math.max(0, Math.min(100, p));
}

/** Percent (0-1) fraction, used for the today line. */
export function frac(date: Date, win: Win): number {
  const p = (date.getTime() - win.start.getTime()) / (win.end.getTime() - win.start.getTime());
  return Math.max(0, Math.min(1, p));
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Axis ticks for the current granularity. Week ticks are thinned so labels
 * never crowd: at most ~14 visible; every Nth week is labelled. */
export function buildAxis(win: Win, gran: Gran, today: Date): AxisTick[] {
  const ticks: AxisTick[] = [];
  if (gran === 'week') {
    // count weeks first to decide the stride
    const totalWeeks = Math.max(1, Math.round((win.end.getTime() - win.start.getTime()) / (7 * DAY)));
    const stride = totalWeeks <= 14 ? 1 : totalWeeks <= 28 ? 2 : Math.ceil(totalWeeks / 14);
    let d = new Date(win.start);
    let i = 0;
    while (d <= win.end) {
      const cur = d <= today && (today.getTime() - d.getTime()) / DAY < 7;
      // always show the current week and every stride-th week
      if (i % stride === 0 || cur) {
        ticks.push({ pos: pct(toISO(d), win), top: 'W' + isoWeekNo(d), bot: `${d.getMonth() + 1}/${d.getDate()}`, current: cur });
      }
      d = new Date(d.getTime() + 7 * DAY);
      i++;
    }
  } else if (gran === 'month') {
    let y = win.start.getFullYear();
    let m = win.start.getMonth();
    while (new Date(y, m, 1) <= win.end) {
      const d = new Date(y, m, 1);
      const cur = y === today.getFullYear() && m === today.getMonth();
      ticks.push({ pos: pct(toISO(d), win), top: `${m + 1}月`, bot: `${y}`, current: cur });
      m++;
      if (m > 11) { m = 0; y++; }
    }
  } else {
    let d = new Date(win.start);
    while (d <= win.end) {
      const q = Math.floor(d.getMonth() / 3) + 1;
      const cur = Math.floor(today.getMonth() / 3) === q - 1 && today.getFullYear() === d.getFullYear();
      ticks.push({ pos: pct(toISO(d), win), top: `Q${q}`, bot: `${d.getFullYear()}`, current: cur });
      d = new Date(d.getFullYear(), d.getMonth() + 3, 1);
    }
  }
  return ticks;
}

/** Node placement date: done → actual, else end, fallback start. */
export function nodeDate(m: { status: string; actual_date: string | null; end_date: string | null; start_date: string | null }): string | null {
  if (m.status === 'done' && m.actual_date) return m.actual_date;
  return m.end_date || m.start_date;
}

export const STATUS_CLASS: Record<string, string> = {
  done: 'done',
  active: 'active-ms',
  risk: 'risk',
  late: 'late',
  upcoming: '',
};

export const STATUS_LABEL: Record<string, string> = {
  done: '已达成',
  active: '进行中',
  risk: '逼近有风险',
  late: '已延期/阻塞',
  upcoming: '未开始',
};

export function fmtDate(s: string | null): string {
  if (!s) return '-';
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
