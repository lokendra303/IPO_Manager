import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, spacing, typography } from '../theme';

type Link = {
  label: string;
  href: string;
};

type Props = {
  links?: Link[];
};

export const AUTH_FOOTER_HEIGHT = 52;

export default function AuthFooter({ links = [] }: Props) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.sm);

  if (!links.length) return null;

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPad }]}>
      {links.map((link) => (
        <Pressable key={link.href} onPress={() => router.push(link.href as any)} style={styles.linkBtn}>
          <Text style={styles.linkText}>{link.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    minHeight: AUTH_FOOTER_HEIGHT,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  linkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  linkText: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.primary,
  },
});
