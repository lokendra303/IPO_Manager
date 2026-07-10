import { Text, View, type ViewStyle } from 'react-native';
import { ui } from '../styles/ui';

type Variant = 'info' | 'warn' | 'success';

type Props = {
  children: string;
  variant?: Variant;
  style?: ViewStyle;
};

const variantStyle: Record<Variant, ViewStyle> = {
  info: ui.bannerInfo,
  warn: ui.bannerWarn,
  success: ui.bannerSuccess,
};

export default function Banner({ children, variant = 'info', style }: Props) {
  return (
    <View style={[ui.banner, variantStyle[variant], style]}>
      <Text style={ui.bannerText}>{children}</Text>
    </View>
  );
}
