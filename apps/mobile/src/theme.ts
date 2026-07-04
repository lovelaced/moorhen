/**
 * Moorhen design tokens — the code twin of designs/README.md.
 * Day theme: warm cream, floating white cards, natural green.
 * Night theme: cruise mode — dark map, high contrast, red only for alerts.
 */

export const day = {
  bg: '#F5F4F1',
  surface: '#FFFFFF',
  surfaceMuted: '#EDECEA',
  ink: '#1A1918',
  ink2: '#6D6C6A',
  ink3: '#9C9B99',
  border: '#E5E4E1',
  borderStrong: '#D1D0CD',
  green: '#3D8A5A',
  greenDark: '#2E6B45',
  greenSoft: '#C8F0D8',
  water: '#5E9DB5',
  waterDeep: '#3F7E96',
  land: '#EFEDE6',
  greenspace: '#DDE8D3',
  shieldRed: '#D9482F',
  redSoft: '#F8DDD6',
  billYellow: '#E8B830',
  amberSoft: '#F7ECCF',
  tabInactive: '#A8A7A5',
} as const

export const night = {
  bg: '#14191B',
  surface: '#1E2528',
  border: '#2C3538',
  ink: '#F0EFEC',
  ink2: '#9FA8A5',
  water: '#4E8CA6',
  trail: '#7FD4A8',
  alert: '#F58D77',
  shieldRed: '#D9482F',
} as const

export const font = {
  regular: 'Outfit_400Regular',
  medium: 'Outfit_500Medium',
  semibold: 'Outfit_600SemiBold',
  bold: 'Outfit_700Bold',
} as const

export const radius = {
  pill: 100,
  sheet: 20,
  card: 16,
  control: 12,
  badge: 4,
} as const

export const shadow = {
  card: {
    shadowColor: '#1A1918',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pill: {
    shadowColor: '#1A1918',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} as const
