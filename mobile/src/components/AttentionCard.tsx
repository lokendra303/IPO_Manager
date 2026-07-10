import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing, typography } from '../theme';

export type AttentionItem = {
  id: string;
  priority: 'high' | 'medium' | 'low';
  type: string;
  title: string;
  detail?: string | null;
  action?: string;
  ipoName?: string;
  ipoNames?: string[];
};

const priorityStyle = {
  high: { border: '#fca5a5', bg: '#fef2f2', icon: 'alert-circle' as const, color: '#b91c1c' },
  medium: { border: '#fcd34d', bg: '#fffbeb', icon: 'time' as const, color: '#b45309' },
  low: { border: '#bae6fd', bg: '#f0f9ff', icon: 'information-circle' as const, color: '#0369a1' },
};

type Props = {
  item: AttentionItem;
  onPress?: () => void;
};

export default function AttentionCard({ item, onPress }: Props) {
  const p = priorityStyle[item.priority] ?? priorityStyle.low;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: p.border, backgroundColor: p.bg },
        pressed && onPress && styles.pressed,
      ]}
    >
      <View style={styles.row}>
        <Ionicons name={p.icon} size={22} color={p.color} />
        <View style={styles.body}>
          <Text style={styles.title}>{item.title}</Text>
          {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.9 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  body: { flex: 1 },
  title: { ...typography.caption, fontWeight: '700', color: colors.text },
  detail: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
});
