import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme';
import { pnlColor } from '../utils/format';

type Variant = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'default';

const variantStyle: Record<Variant, { bg: string; accent: string }> = {
  primary: { bg: '#f0fdfa', accent: colors.primary },
  success: { bg: colors.successLight, accent: colors.success },
  danger: { bg: colors.errorLight, accent: colors.error },
  warning: { bg: colors.warningLight, accent: colors.warning },
  info: { bg: colors.infoLight, accent: colors.info },
  default: { bg: '#f8fafc', accent: colors.textMuted },
};

type Props = {
  title: string;
  value: string | number;
  variant?: Variant;
  valueColor?: string;
  compact?: boolean;
};

export default function StatCard({ title, value, variant = 'default', valueColor, compact = false }: Props) {
  const v = variantStyle[variant];

  return (
    <View style={[styles.card, compact && styles.cardCompact, { backgroundColor: v.bg }, shadows.soft]}>
      <View style={[styles.accent, { backgroundColor: v.accent }]} />
      <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
        {title}
      </Text>
      <Text
        style={[styles.value, compact && styles.valueCompact, { color: valueColor ?? colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.62}
      >
        {value}
      </Text>
    </View>
  );
}

export function PnlStatCard({ title, value, formatted }: { title: string; value: number; formatted: string }) {
  const positive = Number(value) >= 0;
  return (
    <StatCard
      title={title}
      value={formatted}
      valueColor={pnlColor(value)}
      variant={positive ? 'success' : 'danger'}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.md,
    padding: spacing.md,
    paddingTop: spacing.md,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '47%',
    minWidth: '46%',
    maxWidth: '100%',
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  title: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  titleCompact: { fontSize: 13, lineHeight: 17, marginBottom: 4 },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  valueCompact: { fontSize: 18, letterSpacing: -0.2 },
  cardCompact: { minHeight: 76, padding: spacing.sm, paddingTop: spacing.md },
});
