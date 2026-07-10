import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../theme';

type Props = {
  title?: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  style?: ViewStyle;
};

export default function ContentCard({ title, children, extra, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {extra}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.soft,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: { ...typography.section, color: colors.text, flex: 1 },
});
