import { useEffect, useRef, useState } from 'react';
import { Button, Calendar, Input, Space } from 'antd';
import { CalendarOutlined, CloseCircleFilled } from '@ant-design/icons';
import dayjs from 'dayjs';

/**
 * Date field for use inside Modals. Renders the calendar inline in the form
 * so it never clips, opens on one click, and closes on outside click.
 */
export default function ModalDatePicker({
  value,
  onChange,
  format = 'DD MMM YYYY',
  placeholder = 'Select date',
  allowClear = true,
  disabled = false,
  id,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = value ? dayjs(value) : null;

  useEffect(() => {
    if (!open) return undefined;
    const onDocMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  const display = selected?.isValid() ? selected.format(format) : '';

  return (
    <div ref={rootRef} className="modal-date-picker" id={id}>
      <Input
        readOnly
        disabled={disabled}
        value={display}
        placeholder={placeholder}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        suffix={(
          <Space size={4}>
            {allowClear && selected?.isValid() ? (
              <CloseCircleFilled
                className="modal-date-picker-clear"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange?.(null);
                }}
              />
            ) : null}
            <CalendarOutlined
              onClick={(event) => {
                event.stopPropagation();
                if (!disabled) setOpen((prev) => !prev);
              }}
            />
          </Space>
        )}
      />
      {open ? (
        <div className="modal-date-picker-panel">
          <Calendar
            fullscreen={false}
            value={selected?.isValid() ? selected : dayjs()}
            onSelect={(date) => {
              onChange?.(date);
              setOpen(false);
            }}
          />
          <div className="modal-date-picker-footer">
            <Button
              type="link"
              size="small"
              onClick={() => {
                onChange?.(dayjs());
                setOpen(false);
              }}
            >
              Today
            </Button>
            <Button type="link" size="small" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
