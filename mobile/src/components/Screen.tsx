import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BOTTOM_NAV_HEIGHT } from './AppBottomNav';
import { colors, spacing } from '../theme';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  padded?: boolean;
  bottomNavInset?: boolean;
};

export default function Screen({
  children,
  scroll = true,
  style,
  padded = true,
  bottomNavInset = false,
}: Props) {
  const content = (
    <View
      style={[
        padded && styles.padded,
        bottomNavInset && { paddingBottom: spacing.xxl + BOTTOM_NAV_HEIGHT },
        style,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.bgAccent} pointerEvents="none" />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bgAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: colors.primaryLight,
    opacity: 0.35,
  },
  scroll: { flexGrow: 1 },
  padded: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
