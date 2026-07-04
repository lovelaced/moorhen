/**
 * FCM topic naming: one topic per waterway, derived from the waterway names
 * carried on CRT notices. The app subscribes to the topics for "my
 * waterways" / the waterways on the active route. FCM topic names must match
 * [a-zA-Z0-9-_.~%]+.
 */

export function waterwayTopic(waterwayName: string): string {
  const slug = waterwayName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return `ww-${slug || 'unknown'}`
}

export function topicsForWaterways(waterways: readonly string[]): string[] {
  return [...new Set(waterways.map(waterwayTopic))]
}
