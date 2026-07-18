import { Alert } from 'react-native';

export type ActionSheetItem = {
  text: string;
  style?: 'cancel' | 'destructive' | 'default';
  onPress?: () => void;
};

function formatMessage(message?: string | Array<string | null | undefined>) {
  if (message == null) return undefined;
  if (typeof message === 'string') return message;
  const lines = message.filter((line): line is string => Boolean(line && String(line).trim()));
  return lines.length ? lines.join('\n') : undefined;
}

/** Native action sheet (Alert) for secondary mobile actions. Always appends Cancel. */
export function openActionSheet(
  title: string,
  items: ActionSheetItem[] = [],
  message?: string | Array<string | null | undefined>
) {
  const buttons = [
    ...items.map((item) => ({
      text: item.text,
      style: item.style,
      onPress: item.onPress,
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ];
  Alert.alert(title, formatMessage(message), buttons);
}
