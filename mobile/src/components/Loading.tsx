import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '../theme';

export default function Loading({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <View style={[styles.wrap, fullScreen && styles.full]}>
      <View style={styles.box}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.label}>Loading…</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  full: { flex: 1, backgroundColor: colors.bg },
  box: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  label: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
});
