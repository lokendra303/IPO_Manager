import { Platform } from 'react-native';
import { MD3LightTheme } from 'react-native-paper';

export const colors = {
  primary: '#0d9488',
  primaryDark: '#0f766e',
  primaryLight: '#ccfbf1',
  primaryMuted: '#99f6e4',
  success: '#059669',
  successLight: '#d1fae5',
  warning: '#d97706',
  warningLight: '#fef3c7',
  error: '#dc2626',
  errorLight: '#fee2e2',
  info: '#0284c7',
  infoLight: '#e0f2fe',
  bg: '#eef2f7',
  bgElevated: '#ffffff',
  card: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  sider: '#0b1220',
  siderElevated: '#151f32',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

export const radii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const shadows = {
  card: Platform.select({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    android: { elevation: 3 },
    default: {},
  }),
  soft: Platform.select({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
    },
    android: { elevation: 2 },
    default: {},
  }),
};

export const typography = {
  hero: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  section: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.3 },
};

export const appTheme = {
  ...MD3LightTheme,
  roundness: radii.md,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    secondary: colors.info,
    error: colors.error,
    background: colors.bg,
    surface: colors.card,
    onSurface: colors.text,
    outline: colors.border,
    elevation: {
      ...MD3LightTheme.colors.elevation,
      level1: colors.card,
      level2: colors.card,
    },
  },
};
