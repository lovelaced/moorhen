/**
 * Current conditions from Open-Meteo (CC-BY, non-commercial — attribution on
 * the More screen). Wind is the number boaters actually care about: a beam
 * wind makes 20 tonnes of narrowboat handle like a sail.
 */

export interface CurrentWeather {
  tempC: number
  windMph: number
  windDirection: string
  precipitationMm: number
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

let cached: { at: number; key: string; value: CurrentWeather } | null = null
const TTL_MS = 15 * 60 * 1000

export async function fetchWeather(point: [number, number]): Promise<CurrentWeather | null> {
  const key = `${point[0].toFixed(2)},${point[1].toFixed(2)}`
  if (cached && cached.key === key && Date.now() - cached.at < TTL_MS) return cached.value
  try {
    const params = new URLSearchParams({
      latitude: String(point[1]),
      longitude: String(point[0]),
      current: 'temperature_2m,wind_speed_10m,wind_direction_10m,precipitation',
      wind_speed_unit: 'mph',
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
    if (!response.ok) return null
    const data = (await response.json()) as {
      current?: {
        temperature_2m?: number
        wind_speed_10m?: number
        wind_direction_10m?: number
        precipitation?: number
      }
    }
    const current = data.current
    if (!current || current.wind_speed_10m == null) return null
    const value: CurrentWeather = {
      tempC: current.temperature_2m ?? 0,
      windMph: current.wind_speed_10m,
      windDirection: COMPASS[Math.round((current.wind_direction_10m ?? 0) / 45) % 8]!,
      precipitationMm: current.precipitation ?? 0,
    }
    cached = { at: Date.now(), key, value }
    return value
  } catch {
    return null
  }
}
