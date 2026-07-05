/**
 * Human-friendly rendering of OSM opening_hours. Handles the patterns that
 * cover nearly all UK pubs/shops; anything exotic falls back to the raw
 * string (which is still fairly readable).
 */

const DAYS: Record<string, string> = {
  Mo: 'Mon',
  Tu: 'Tue',
  We: 'Wed',
  Th: 'Thu',
  Fr: 'Fri',
  Sa: 'Sat',
  Su: 'Sun',
  PH: 'Bank hols',
  SH: 'School hols',
}

function prettifyDays(part: string): string {
  return part
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b/g, (d) => DAYS[d] ?? d)
    .replace(/-/g, '–')
    .replace(/,/g, ', ')
}

function prettifyTimes(part: string): string {
  // 12:00-23:00 → 12:00–23:00 ; "off"/"closed" → closed
  return part.replace(/(\d\d:\d\d)-(\d\d:\d\d)/g, '$1–$2').replace(/\b(off|closed)\b/i, 'closed')
}

/** One line per rule: "Mon–Fri 12:00–23:00", "Sat, Sun 10:00–00:00". */
export function formatOpeningHours(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed === '24/7') return ['Open 24 hours']
  return trimmed
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const match = rule.match(/^([A-Za-z,\- ]+?)\s+(.+)$/)
      if (match && /\d/.test(match[2]!)) {
        return `${prettifyDays(match[1]!)}  ${prettifyTimes(match[2]!)}`
      }
      return prettifyTimes(prettifyDays(rule))
    })
}
