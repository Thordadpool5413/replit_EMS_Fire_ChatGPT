import React from 'react';

type Props = { id: string; label: string; hint?: string; children: React.ReactElement<{ id?: string; 'aria-describedby'?: string }> };
/** Labelled field wrapper for local research forms. */
export const ResearchField: React.FC<Props> = ({ id, label, hint, children }) => (
  <div className="pds-field">
    <label htmlFor={id}>{label}</label>
    {React.cloneElement(children, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })}
    {hint && <p id={`${id}-hint`} className="pds-hint">{hint}</p>}
  </div>
);
export const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
