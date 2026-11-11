/** Field notes: chronological log plus a logger with a real due-date input. Uses the app's onAddFieldNote callback. */
import React, { useState } from 'react';
import { CalendarClock, NotebookPen, Send } from 'lucide-react';
import type { Agency, FieldNote } from '../../types';

const MEETING_TYPES: FieldNote['meetingType'][] = ['On-Site Station Visit', 'Phone Call', 'Virtual Demo', 'RFP Review', 'Ride-Along'];
const today = () => new Date().toISOString().slice(0, 10);

export const FieldNotesPanel: React.FC<{
  agency: Agency;
  onAdd: (agencyId: string, note: Omit<FieldNote, 'id'>) => void;
}> = ({ agency, onAdd }) => {
  const [meetingType, setMeetingType] = useState<FieldNote['meetingType']>('On-Site Station Visit');
  const [noteText, setNoteText] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saved, setSaved] = useState('');
  const notes = [...(agency.fieldNotes ?? [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const dueInvalid = Boolean(dueDate) && dueDate < today();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || dueInvalid) return;
    onAdd(agency.id, {
      date: today(),
      repName: 'Territory Director',
      meetingType,
      notes: noteText.trim(),
      nextAction: nextAction.trim(),
      dueDate,
    });
    setNoteText(''); setNextAction(''); setDueDate('');
    setSaved('Note added to this agency.');
  };

  return (
    <div className="afn" data-testid="field-notes-panel">
      <section className="afn-log" aria-labelledby="afn-log-title">
        <h3 id="afn-log-title"><NotebookPen aria-hidden="true" className="h-4 w-4" />Field interaction history <span className="afn-count">{notes.length}</span></h3>
        {notes.length === 0 ? (
          <p className="afn-empty">No interactions logged yet. Your first note sets the recommended next action on the Overview.</p>
        ) : (
          <ol className="afn-list">
            {notes.map((note) => (
              <li key={note.id} data-testid={`field-note-${note.id}`}>
                <p className="afn-meta"><span>{note.date}</span><b>{note.meetingType}</b><span>{note.repName}</span></p>
                <p className="afn-text">{note.notes}</p>
                {note.nextAction && (
                  <p className="afn-next"><CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />{note.nextAction}{note.dueDate ? <em> · due {note.dueDate}</em> : <em> · no due date</em>}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      <form className="afn-form" onSubmit={submit} aria-labelledby="afn-form-title">
        <h3 id="afn-form-title">Log interaction</h3>
        <label>Type
          <select value={meetingType} onChange={(e) => setMeetingType(e.target.value as FieldNote['meetingType'])} data-testid="select-note-type">
            {MEETING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>Notes
          <textarea rows={4} value={noteText} onChange={(e) => { setNoteText(e.target.value); setSaved(''); }} placeholder="Discussion, priorities, equipment confirmed or corrected" data-testid="input-note-text" />
        </label>
        <div className="afn-row">
          <label>Next action
            <input type="text" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Optional" data-testid="input-note-next-action" />
          </label>
          <label>Due date
            <input type="date" value={dueDate} min={today()} onChange={(e) => setDueDate(e.target.value)} aria-invalid={dueInvalid} data-testid="input-note-due-date" />
          </label>
        </div>
        {dueInvalid && <p className="afn-error" role="alert">Due date cannot be in the past.</p>}
        <button type="submit" disabled={!noteText.trim() || dueInvalid} data-testid="button-save-field-note"><Send aria-hidden="true" className="h-3.5 w-3.5" />Save note</button>
        {saved && <p className="afn-saved" role="status">{saved}</p>}
      </form>
    </div>
  );
};

export default FieldNotesPanel;
