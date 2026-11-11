import type { DateWindow } from '../contracts.ts';
export function localDate(instant: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
    const p = (type: string) => parts.find(v => v.type === type)!.value;
    return `${p('year')}-${p('month')}-${p('day')}`;
}
export function shiftDay(day: string, delta: number): string {
    const date = new Date(`${day}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
}
function validDay(day: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day; }
/** Derive each boundary independently: local days can be 23 or 25 hours across DST. */
export function midnight(day: string, timeZone: string): string {
    if (!validDay(day))
        throw new Error('Invalid calendar date');
    const target = Date.parse(`${day}T00:00:00Z`);
    let instant = target;
    const f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (let i = 0; i < 5; i++) {
        const parts = f.formatToParts(new Date(instant));
        const n = (type: string) => Number(parts.find(p => p.type === type)!.value);
        const represented = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
        const error = represented - target;
        if (!error)
            return new Date(instant).toISOString();
        instant -= error;
    }
    // A small number of zones have a midnight transition or a skipped civil day.
    // Do not return a fabricated boundary: let the caller disclose unsupported resolution.
    throw new Error('This civil day has an unusual timezone transition; specify an explicit date/time');
}
export function dayWindow(day: string, timeZone: string, label = day, ambiguous = false): DateWindow {
    return { label, local_date: day, start: midnight(day, timeZone), end: midnight(shiftDay(day, 1), timeZone), ambiguous };
}
const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export function resolveDates(text: string, now: Date, timeZone: string): DateWindow[] {
    const lower = text.toLowerCase();
    const today = localDate(now, timeZone);
    const result: DateWindow[] = [];
    const add = (day: string, label: string, ambiguous = false) => { if (validDay(day) && !result.some(r => r.local_date === day))
        result.push(dayWindow(day, timeZone, label, ambiguous)); };
    for (const match of lower.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g))
        add(match[1]!, match[0]);
    const monthPattern = months.join('|');
    for (const m of lower.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s+(\\d{4}))?\\b`, 'g'))) {
        let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
        const suffix = `-${String(months.indexOf(m[2]!) + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
        if (!m[3] && `${year}${suffix}` > today)
            year--;
        add(`${year}${suffix}`, m[0]);
    }
    for (const m of lower.matchAll(new RegExp(`\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'g'))) {
        let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
        const suffix = `-${String(months.indexOf(m[1]!) + 1).padStart(2, '0')}-${m[2]!.padStart(2, '0')}`;
        if (!m[3] && `${year}${suffix}` > today)
            year--;
        add(`${year}${suffix}`, m[0]);
    }
    if (/\byesterday\b/.test(lower))
        add(shiftDay(today, -1), 'yesterday');
    // "today" in "is it still correct today?" is the comparison endpoint, not the old baseline.
    if (!result.length && !/\b(last|on)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower) && /\b(today|earlier today)\b/.test(lower) && !/\b(still|since|changed|correct)\b/.test(lower))
        add(today, 'today');
    const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
    for (const m of lower.matchAll(/\b(?:(last|on|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g)) {
        const target = weekdays.indexOf(m[2]!);
        let delta = (dow - target + 7) % 7;
        if (m[1] === 'last' && delta === 0)
            delta = 7;
        add(shiftDay(today, -delta), m[0], m[1] === 'last');
        // "last Tuesday" can mean previous calendar week, rather than the most recent Tuesday.
        if (m[1] === 'last') {
            const mondayDelta = (dow + 6) % 7;
            const previousWeekDay = shiftDay(today, -mondayDelta - 7 + (target + 6) % 7);
            add(previousWeekDay, `${m[0]} (previous calendar week interpretation)`, true);
        }
    }
    if (/\blast week\b/.test(lower) && !result.length) {
        const start = shiftDay(today, -((dow + 6) % 7) - 7), end = shiftDay(start, 7);
        result.push({ label: 'last week (Monday–Sunday)', local_date: start, start: midnight(start, timeZone), end: midnight(end, timeZone), ambiguous: false });
    }
    return result;
}
