import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows, spacing, typography } from '../theme';

export type BottomNavTab = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  href: string;
  match?: (path: string) => boolean;
};

export const BOTTOM_NAV_HEIGHT = 58;

type Props = {
  tabs: BottomNavTab[];
};

export default function AppBottomNav({ tabs }: Props) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, spacing.sm);

  const onPress = (tab: BottomNavTab) => {
    const active = tab.match?.(pathname) ?? (pathname === tab.href || pathname.startsWith(`${tab.href}/`));
    if (active) return;
    router.replace(tab.href as any);
  };

  return (
    <View style={[styles.wrap, { paddingBottom: bottomPad }]}>
      {tabs.map((tab) => {
        const active = tab.match?.(pathname) ?? (pathname === tab.href || pathname.startsWith(`${tab.href}/`));
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => onPress(tab)}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Ionicons
                name={active ? tab.iconActive : tab.icon}
                size={20}
                color={active ? '#fff' : colors.textSecondary}
              />
            </View>
            <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    minHeight: BOTTOM_NAV_HEIGHT,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.soft,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  itemPressed: { opacity: 0.85 },
  iconWrap: {
    width: 36,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.primary,
  },
  label: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
});
