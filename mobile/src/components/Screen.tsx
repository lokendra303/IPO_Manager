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
  scroll: { flexGrow: 1 },
  padded: { padding: spacing.lg, paddingBottom: spacing.xxl },
});
