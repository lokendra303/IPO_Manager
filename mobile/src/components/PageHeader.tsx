import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  extra?: React.ReactNode;
  style?: ViewStyle;
};

export default function PageHeader({ title, subtitle, right, extra, style }: Props) {
  const action = right ?? extra;

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.accent} />
      <View style={styles.inner}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {action ? <View style={styles.right}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  accent: {
    height: 4,
    backgroundColor: colors.primary,
  },
  inner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  textBlock: { flexGrow: 1, flexBasis: 180, minWidth: '62%' },
  title: { ...typography.title, fontSize: 22, color: colors.text },
  subtitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 4, lineHeight: 21 },
  right: { flexShrink: 0, alignItems: 'flex-end' },
});
