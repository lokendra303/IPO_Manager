import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  badge?: string;
};

export default function ListRow({ title, subtitle, right, onPress, badge }: Props) {
  const content = (
    <>
      <View style={styles.left}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {right}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.sm,
  },
  pressed: { backgroundColor: colors.primaryLight, borderColor: colors.primaryMuted },
  left: { flex: 1 },
  title: { ...typography.body, fontWeight: '600', color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
