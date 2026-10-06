import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from 'react-native-paper';
import { ui } from '../styles/ui';
import { spacing } from '../theme';

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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={ui.modalBody}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[ui.modalBody, { flex: 1 }]}>{children}</View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
          {footer ? (
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm }}>
              {footer}
            </View>
          ) : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
