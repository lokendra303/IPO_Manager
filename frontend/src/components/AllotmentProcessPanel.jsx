import { Progress, Typography } from 'antd';
import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
} from '@ant-design/icons';
import AllotmentStatusBadge from './AllotmentStatusBadge';

const STEPS = [
  { key: 'connect', label: 'Connect', hint: 'Live registrar' },
  { key: 'check', label: 'Check PAN', hint: 'One member at a time' },
  { key: 'save', label: 'Save result', hint: 'Status on the member' },
];

function stepState(key, checking, progress, summary) {
  if (summary && !checking) {
    if (!summary.checked) {
      if (key === 'connect') return 'done';
      if (key === 'check') return 'error';
      return 'idle';
    }
    return 'done';
  }
  if (!checking) return 'idle';
  if (progress?.phase === 'blocked') {
    if (key === 'connect') return 'done';
    if (key === 'check') return 'error';
    return 'idle';
  }
  if (key === 'connect') return progress?.name || progress?.phase === 'checking' ? 'done' : 'active';
  if (key === 'check') return 'active';
  if (key === 'save') return (progress?.current || 0) > 0 ? 'done' : 'idle';
  return 'idle';
}

export default function AllotmentProcessPanel({
  checking,
  progress,
  summary,
  activity = [],
  compact = false,
  waitingForListing = false,
}) {
  const percent = progress?.total
    ? Math.round((Math.min(progress.current, progress.total) / progress.total) * 100)
    : 0;
  const log = compact ? activity.slice(0, 4) : activity.slice(0, 6);

  return (
    <div className="allotment-process-panel">
      <ol className="allotment-steps">
        {STEPS.map((step, i) => {
          const state = stepState(step.key, checking, progress, summary);
          return (
            <li key={step.key} className={`allotment-step allotment-step--${state}`}>
              <span className="allotment-step-index">
                {state === 'done' ? <CheckCircleFilled /> : state === 'active' ? <LoadingOutlined spin /> : i + 1}
              </span>
              <span className="allotment-step-copy">
                <strong>{step.label}</strong>
                <span>{step.hint}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {checking && progress ? (
        <div className="allotment-process">
          <div className="allotment-process-top">
            <div>
              <div className="allotment-process-kicker">
                Live check · {progress.providerLabel || 'registrar'}
              </div>
              <div className="allotment-process-title">
                {progress.phase === 'blocked'
                  ? 'Registrar not ready'
                  : progress.name
                    ? `Checking ${progress.name}`
                    : 'Connecting to registrar…'}
              </div>
              <div className="allotment-process-meta">
                {progress.current} of {progress.total} checked
                {progress.allotted != null && (
                  <>
                    {' '}
                    · {waitingForListing ? 'waiting for listing' : 'allotted'} {progress.allotted} · not allotted {progress.notAllotted}
                  </>
                )}
              </div>
            </div>
            <div className="allotment-process-pct">{percent}%</div>
          </div>
          <Progress
            percent={percent}
            showInfo={false}
            status={progress.phase === 'blocked' ? 'exception' : 'active'}
            strokeColor={progress.phase === 'blocked' ? undefined : { from: '#14b8a6', to: '#0d9488' }}
            trailColor="#e2e8f0"
          />
          {progress.message && (
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              {progress.message}
            </Typography.Paragraph>
          )}
          {log.length > 0 && (
            <ul className="allotment-activity">
              {log.map((item) => (
                <li key={item.key} className="allotment-activity-row">
                  <span className="allotment-activity-name">{item.name}</span>
                  <AllotmentStatusBadge status={item.status} lots={item.lots} waitingForListing={waitingForListing} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : summary ? (
        <div className={`allotment-summary ${summary.checked ? 'allotment-summary--ok' : 'allotment-summary--warn'}`}>
          {summary.checked ? <CheckCircleFilled /> : <CloseCircleFilled />}
          <div>
            <strong>
              {summary.message && !summary.checked
                ? summary.message
                : `Last run · checked ${summary.checked} · ${waitingForListing ? 'waiting for listing' : 'allotted'} ${summary.allotted} · not allotted ${summary.notAllotted}`}
            </strong>
            <div>
              {summary.checked
                ? waitingForListing
                  ? 'Allotted members wait for listing. Mark the IPO listed before withdrawal and P&L.'
                  : 'Results are saved on each member. Enter withdrawal and P&L for allotted rows.'
                : 'Leave members pending or mark them by hand.'}
            </div>
          </div>
        </div>
      ) : (
        <Typography.Paragraph type="secondary" className="allotment-process-idle">
          Click <strong>Check pending</strong> to query each member PAN on the registrar that has this IPO. The table highlights the row being checked and updates as each result comes in.
        </Typography.Paragraph>
      )}
    </div>
  );
}
