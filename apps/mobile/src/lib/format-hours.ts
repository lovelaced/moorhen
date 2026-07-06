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

const DAY_KEYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

function daysOfPart(part: string): Set<number> | null {
  const days = new Set<number>()
  for (const token of part.split(',')) {
    const range = token.trim()
    const match = range.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/)
    if (!match) return null
    const from = DAY_KEYS.indexOf(match[1] as (typeof DAY_KEYS)[number])
    const to = match[2] ? DAY_KEYS.indexOf(match[2] as (typeof DAY_KEYS)[number]) : from
    for (let d = from; ; d = (d + 1) % 7) {
      days.add(d)
      if (d === to) break
    }
  }
  return days
}

/**
 * Is the place open right now? Handles the grammar that covers nearly all UK
 * pubs/shops: "24/7", rule lists of "<days> <hh:mm-hh:mm[,hh:mm-hh:mm]>" and
 * "<days> off". Returns null when the string uses anything fancier — better
 * no tag than a wrong one.
 */
export function isOpenNow(raw: string, now: Date = new Date()): boolean | null {
  const trimmed = raw.trim()
  if (trimmed === '24/7') return true
  const day = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()

  let verdict: boolean | null = false // no matching rule → closed (if all rules parse)
  for (const rule of trimmed.split(';')) {
    const text = rule.trim()
    if (!text) continue
    const match = text.match(/^([A-Za-z,\- ]+?)\s+(.+)$/)
    if (!match) return null
    const days = daysOfPart(match[1]!.trim())
    if (!days) return null
    const times = match[2]!.trim()
    if (/^(off|closed)$/i.test(times)) {
      if (days.has(day)) verdict = false
      continue
    }
    for (const span of times.split(',')) {
      const tm = span.trim().match(/^(\d\d):(\d\d)-(\d\d):(\d\d)$/)
      if (!tm) return null
      const from = Number(tm[1]) * 60 + Number(tm[2])
      const rawTo = Number(tm[3]) * 60 + Number(tm[4])
      if (rawTo <= from) {
        // past-midnight close ("Sa 12:00-01:00"): open late on the listed
        // day, and in the small hours of the FOLLOWING day
        if (days.has(day) && minutes >= from) verdict = true
        if (days.has((day + 6) % 7) && minutes < rawTo) verdict = true
      } else if (days.has(day) && minutes >= from && minutes < rawTo) {
        verdict = true
      }
    }
  }
  return verdict
}
