import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../theme';

type AuthFieldProps = TextInputProps & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function AuthField({ label, icon, style, ...props }: AuthFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        {icon ? (
          <Ionicons name={icon} size={18} color={colors.textMuted} style={styles.icon} />
        ) : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          style={[styles.input, icon ? styles.inputWithIcon : null, style]}
          {...props}
        />
      </View>
    </View>
  );
}

type RoleTab = { value: string; label: string; icon: keyof typeof Ionicons.glyphMap };

export function AuthRoleTabs({
  value,
  onChange,
  tabs,
}: {
  value: string;
  onChange: (v: string) => void;
  tabs: RoleTab[];
}) {
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            onPress={() => onChange(tab.value)}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={active ? '#fff' : colors.textSecondary}
            />
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function AuthRemember({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.remember} hitSlop={6}>
      <View style={[styles.check, checked && styles.checkOn]}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      <Text style={styles.rememberText}>{label}</Text>
    </Pressable>
  );
}

export function AuthPrimaryButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.cta,
        (disabled || loading) && styles.ctaDisabled,
        pressed && styles.ctaPressed,
      ]}
    >
      <Text style={styles.ctaText}>{loading ? 'Please wait…' : label}</Text>
    </Pressable>
  );
}

export function AuthLinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.linkBtn}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.md },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 52,
    paddingHorizontal: spacing.md,
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
            paddingVertical: 14,
            fontWeight: '500',
          },
          inputWithIcon: {},
          tabs: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: radii.lg,
    padding: 4,
    marginBottom: spacing.lg,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: { color: '#fff' },
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
    paddingVertical: 4,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rememberText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radii.lg,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  ctaDisabled: { opacity: 0.55 },
  ctaText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  linkText: {
    color: colors.primaryDark,
    fontSize: 14,
    fontWeight: '600',
  },
});
