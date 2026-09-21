import { useEffect, useState } from 'react';
import { Alert, Text } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import SlideModal from './SlideModal';
import Banner from './Banner';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';
import { isValidEmail, parseExtraEmails, sendPdfEmail } from '../utils/emailPdf';
import { ui } from '../styles/ui';

type Attachment = {
  pdfBase64: string;
  fileName: string;
  summary?: string;
  period?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  alertTitle?: string;
  alertDescription?: string;
  endpoint: string;
  canSend?: boolean;
  disabledReason?: string;
  buildAttachment: () => Promise<Attachment> | Attachment;
};

export default function EmailPdfModal({
  visible,
  onClose,
  title = 'Email PDF',
  alertTitle,
  alertDescription,
  endpoint,
  canSend = true,
  disabledReason = 'Nothing to send',
  buildAttachment,
}: Props) {
  const { user } = useAuth();
  const [to, setTo] = useState('');
  const [extra, setExtra] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTo(user?.email || '');
    setExtra('');
  }, [visible, user?.email]);

  const sendPdf = async () => {
    if (!canSend) {
      Alert.alert('Cannot send', disabledReason);
      return;
    }
    const dest = to.trim();
    if (!isValidEmail(dest)) {
      Alert.alert('Email', 'Enter a valid email');
      return;
    }
    const extras = parseExtraEmails(extra);
    const bad = extras.find((e) => !isValidEmail(e));
    if (bad) {
      Alert.alert('Email', `Invalid extra email: ${bad}`);
      return;
    }
    if (extras.length > 4) {
      Alert.alert('Email', 'You can add at most 4 extra emails');
      return;
    }
    setSending(true);
    try {
      const attachment = await buildAttachment();
      const data = await sendPdfEmail(endpoint, {
        to: dest,
        extra: extras,
        fileName: attachment.fileName,
        pdfBase64: attachment.pdfBase64,
        summary: attachment.summary,
        period: attachment.period,
      });
      Alert.alert('Sent', data.message || `PDF sent to ${dest}`);
      onClose();
    } catch (err) {
      Alert.alert('Could not send PDF', getErrorMessage(err, 'Could not send PDF'));
    } finally {
      setSending(false);
    }
  };

  return (
    <SlideModal
      visible={visible}
      title={title}
      onClose={onClose}
      footer={(
        <>
          <Button mode="contained" loading={sending} onPress={sendPdf} style={{ marginTop: 8 }}>
            Send PDF
          </Button>
          <Button mode="text" onPress={onClose} disabled={sending}>Cancel</Button>
        </>
      )}
    >
      {alertTitle || alertDescription ? (
        <Banner variant="info">
          {alertTitle ? `${alertTitle}\n` : ''}{alertDescription || ''}
        </Banner>
      ) : null}
      <Text style={ui.sectionLabel}>Send to</Text>
      <TextInput
        label="Email"
        value={to}
        onChangeText={setTo}
        keyboardType="email-address"
        autoCapitalize="none"
        mode="outlined"
        style={ui.input}
      />
      <Text style={ui.sectionLabel}>Also send to (optional)</Text>
      <TextInput
        label="Extra emails"
        value={extra}
        onChangeText={setExtra}
        autoCapitalize="none"
        mode="outlined"
        style={ui.input}
        placeholder="partner@email.com, accounts@email.com"
      />
      <Text style={ui.muted}>Separate extra addresses with a comma.</Text>
    </SlideModal>
  );
}
