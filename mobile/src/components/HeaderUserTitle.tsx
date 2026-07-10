import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
};

function getInitials(label: string) {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export default function HeaderUserTitle({ title, subtitle }: Props) {
  const initials = getInitials(title);

  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 240,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.caption,
    fontWeight: '800',
    color: colors.primaryDark,
  },
  text: { flex: 1, minWidth: 0 },
  title: {
    ...typography.section,
    fontSize: 16,
    color: colors.text,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
