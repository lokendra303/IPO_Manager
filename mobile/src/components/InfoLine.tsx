import { Text, View, type ViewStyle } from 'react-native';
import { ui } from '../styles/ui';

type Props = {
  label: string;
  value: string;
  valueColor?: string;
  style?: ViewStyle;
};

export default function InfoLine({ label, value, valueColor, style }: Props) {
  return (
    <View style={[ui.infoLine, style]}>
      <Text style={ui.infoLabel}>{label}</Text>
      <Text style={[ui.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}
