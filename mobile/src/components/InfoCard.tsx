import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { ui } from '../styles/ui';

type Variant = 'default' | 'muted' | 'highlight' | 'warn' | 'danger' | 'totals';

type Props = {
  title?: string;
  meta?: string;
  children: React.ReactNode;
  onPress?: () => void;
  variant?: Variant;
  style?: ViewStyle;
};

const variantStyle: Record<Variant, ViewStyle> = {
  default: {},
  muted: ui.cardMuted,
  highlight: ui.cardHighlight,
  warn: ui.cardWarn,
  danger: ui.cardDanger,
  totals: ui.cardTotals,
};

export default function InfoCard({ title, meta, children, onPress, variant = 'default', style }: Props) {
  const body = (
    <View style={[ui.card, variantStyle[variant], style]}>
      {title ? <Text style={ui.cardTitle}>{title}</Text> : null}
      {meta ? <Text style={ui.cardMeta}>{meta}</Text> : null}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
        {body}
      </Pressable>
    );
  }

  return body;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
});
