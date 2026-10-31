import { useState } from 'react';
import { googleCalendarUrl, downloadIcs } from '../lib/calendar';

// «📅 В календарь»: Google Calendar (Android и любой браузер) или файл .ics (iPhone, Outlook и др.)
export default function AddToCalendar({ event }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="cal-menu">
      <button type="button" className="btn ghost" onClick={() => setOpen((o) => !o)}>📅 В календарь</button>
      {open && (
        <span className="cal-options">
          <a className="btn ghost small" href={googleCalendarUrl(event)} target="_blank" rel="noreferrer">
            Google Календарь (Android)
          </a>
          <button type="button" className="btn ghost small" onClick={() => { downloadIcs(event); setOpen(false); }}>
            Файл .ics (iPhone)
          </button>
        </span>
      )}
    </span>
  );
}
