import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space, message } from 'antd';
import { DownloadOutlined, MailOutlined } from '@ant-design/icons';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/errors';

export default function EmailPdfModal({
  open,
  onClose,
  title = 'Email PDF',
  alertTitle,
  alertDescription,
  endpoint,
  buildAttachment,
  onDownload,
  canSend = true,
  disabledReason = 'Nothing to send',
  zIndex = 1200,
}) {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      to: user?.email || '',
      extra: '',
    });
  }, [open, user?.email, form]);

  const downloadPdf = async () => {
    if (!canSend) {
      message.warning(disabledReason);
      return;
    }
    setDownloading(true);
    try {
      await onDownload?.();
      message.success('PDF downloaded');
    } catch (err) {
      message.error(getErrorMessage(err, 'Could not create PDF'));
    } finally {
      setDownloading(false);
    }
  };

  const sendPdf = async () => {
    if (!canSend) {
      message.warning(disabledReason);
      return;
    }
    try {
      const values = await form.validateFields();
      setSending(true);
      const extra = String(values.extra || '')
        .split(/[,;\s]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const attachment = await buildAttachment();
      const { data } = await client.post(endpoint, {
        to: values.to,
        extra,
        fileName: attachment.fileName,
        pdfBase64: attachment.pdfBase64,
        summary: attachment.summary,
        period: attachment.period,
      }, { timeout: 30000 });
      message.success(data.message || `PDF sent to ${values.to}`);
      onClose?.();
    } catch (err) {
      if (err?.errorFields) return;
      message.error(getErrorMessage(err, 'Could not send PDF'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      destroyOnClose
      zIndex={zIndex}
      footer={(
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          {onDownload ? (
            <Button icon={<DownloadOutlined />} loading={downloading} onClick={downloadPdf}>
              Download PDF
            </Button>
          ) : null}
          <Button type="primary" icon={<MailOutlined />} loading={sending} onClick={sendPdf}>
            Send PDF
          </Button>
        </Space>
      )}
    >
      {(alertTitle || alertDescription) && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={alertTitle}
          description={alertDescription}
        />
      )}
      <Form form={form} layout="vertical">
        <Form.Item
          name="to"
          label="Send to"
          rules={[
            { required: true, message: 'Enter an email' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
        >
          <Input placeholder="you@email.com" autoComplete="email" />
        </Form.Item>
        <Form.Item
          name="extra"
          label="Also send to (optional)"
          extra="Separate extra addresses with a comma"
          rules={[
            {
              validator: (_, value) => {
                const extras = String(value || '').split(/[,;\s]+/).filter(Boolean);
                const bad = extras.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
                if (bad) return Promise.reject(new Error(`Invalid email: ${bad}`));
                if (extras.length > 4) return Promise.reject(new Error('You can add at most 4 extra emails'));
                return Promise.resolve();
              },
            },
          ]}
        >
          <Input placeholder="partner@email.com, accounts@email.com" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
