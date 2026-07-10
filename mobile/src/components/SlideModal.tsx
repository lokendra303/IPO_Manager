import type { ReactNode } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { ui } from '../styles/ui';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeLabel?: string;
  headerRight?: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
};

export default function SlideModal({
  visible,
  title,
  onClose,
  children,
  closeLabel = 'Close',
  headerRight,
  scroll = true,
  footer,
}: Props) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={ui.modalBody} keyboardShouldPersistTaps="handled">
      {children}
      {footer}
    </ScrollView>
  ) : (
    <View style={[ui.modalBody, { flex: 1 }]}>
      {children}
      {footer}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={ui.modal}>
        <View style={ui.modalHeader}>
          <Text style={ui.modalTitle} numberOfLines={2}>
            {title}
          </Text>
          {headerRight ?? (
            <Button mode="text" onPress={onClose}>
              {closeLabel}
            </Button>
          )}
        </View>
        {body}
      </SafeAreaView>
    </Modal>
  );
}
