import { useMemo } from 'react';
import { Typography } from 'antd';
import { useAuth } from '../context/AuthContext';
import EmailPdfModal from './EmailPdfModal';
import {
  allotmentCheckPdfBase64,
  downloadAllotmentCheckPdf,
  summarizeAllotmentRows,
} from '../utils/allotmentCheckPdf';

export default function AllotmentEmailPdfModal({
  open,
  onClose,
  ipoId,
  ipoName,
  applications = [],
  waitingForListing = false,
}) {
  const { user } = useAuth();
  const { counts, summary } = useMemo(
    () => summarizeAllotmentRows(applications, waitingForListing),
    [applications, waitingForListing]
  );

  const pdfPayload = () => ({
    ipoName,
    applications,
    waitingForListing,
  });

  const pdfMeta = () => ({
    teamName: user?.tenantName || 'IPO Team',
    generatedAt: new Date().toISOString(),
  });

  return (
    <EmailPdfModal
      open={open}
      onClose={onClose}
      title="Email allotment PDF"
      alertTitle={ipoName ? `${ipoName} allotment list` : 'Allotment list'}
      alertDescription={(
        <div>
          <div>{summary}</div>
          <Typography.Text type="secondary">
            {counts.checked} checked · {counts.allotted} {waitingForListing ? 'waiting for listing' : 'allotted'} · {counts.notAllotted} not allotted
          </Typography.Text>
        </div>
      )}
      endpoint={`/ipos/${ipoId}/allotment/email-pdf`}
      canSend={applications.length > 0}
      disabledReason="No members to include"
      buildAttachment={() => {
        const built = allotmentCheckPdfBase64(pdfPayload(), pdfMeta());
        return { pdfBase64: built.pdfBase64, fileName: built.fileName, summary };
      }}
      onDownload={() => {
        downloadAllotmentCheckPdf(pdfPayload(), pdfMeta());
      }}
    />
  );
}
