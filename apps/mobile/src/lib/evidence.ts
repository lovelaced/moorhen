import type { CruiseSession } from './log-store'

/**
 * The CC evidence pack: the movement log in shareable form. CRT asks
 * continuous cruisers to evidence bona fide navigation — this is that,
 * from data that never left the device until you pressed export.
 */

const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const fmtTime = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const hoursOf = (s: CruiseSession) => (s.endedAtMs - s.startedAtMs) / 3_600_000

export function sessionsToCsv(sessions: readonly CruiseSession[]): string {
  const header = 'date,kind,start_utc,end_utc,duration_h,distance_miles,waterway'
  const rows = sessions.map((s) =>
    [
      fmtDate(s.startedAtMs),
      s.kind ?? 'cruise',
      fmtTime(s.startedAtMs),
      fmtTime(s.endedAtMs),
      hoursOf(s).toFixed(2),
      (s.distanceM / 1609.344).toFixed(2),
      `"${(s.waterway ?? '').replace(/"/g, '""')}"`,
    ].join(','),
  )
  return [header, ...rows].join('\n') + '\n'
}

export function sessionsToHtml(sessions: readonly CruiseSession[]): string {
  const totalMi = sessions.reduce((sum, s) => sum + s.distanceM, 0) / 1609.344
  const rows = sessions
    .map(
      (s) => `<tr>
        <td>${fmtDate(s.startedAtMs)}</td>
        <td>${s.kind === 'mooring' ? 'Moored' : 'Cruise'}</td>
        <td>${(s.distanceM / 1609.344).toFixed(1)} mi</td>
        <td>${hoursOf(s).toFixed(1)} h</td>
        <td>${s.waterway ?? ''}</td>
      </tr>`,
    )
    .join('')
  return `<html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Roboto, sans-serif; padding: 24px; color: #21201d; }
    h1 { font-size: 20px; } p { color: #5c5952; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e2da; }
    th { color: #5c5952; font-weight: 600; }
  </style></head><body>
    <h1>Moorhen cruise log</h1>
    <p>${sessions.length} entries · ${totalMi.toFixed(1)} miles logged · exported ${new Date().toISOString().slice(0, 10)} · recorded on-device by Moorhen</p>
    <table><tr><th>Date</th><th>Type</th><th>Distance</th><th>Duration</th><th>Waterway</th></tr>${rows}</table>
  </body></html>`
}
