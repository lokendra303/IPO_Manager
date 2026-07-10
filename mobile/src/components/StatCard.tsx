import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../theme';
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
};

export default function StatCard({ title, value, variant = 'default', valueColor }: Props) {
  const v = variantStyle[variant];

  return (
    <View style={[styles.card, { backgroundColor: v.bg }, shadows.soft]}>
      <View style={[styles.accent, { backgroundColor: v.accent }]} />
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.value, { color: valueColor ?? colors.text }]}>{value}</Text>
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
    paddingTop: spacing.lg,
    flex: 1,
    minHeight: 84,
    borderWidth: 1,
    borderColor: colors.borderLight,
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
    ...typography.label,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  value: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
});
