import React from 'react';
import { ChevronDown, MapPin } from 'lucide-react';

/** Presentation only. Children stay mounted when the contact panel is closed. */
export function ProfileContactDisclosure({ children }: { children: React.ReactNode }) {
  return (
    <details className="profile-contact-disclosure" data-testid="profile-contact-disclosure">
      <summary>
        <MapPin aria-hidden="true" className="profile-contact-disclosure-icon" />
        <span className="profile-contact-disclosure-heading">
          <strong>Location &amp; recorded contacts</strong>
          <span>Address, phone numbers, website and people</span>
        </span>
        <ChevronDown aria-hidden="true" className="profile-contact-disclosure-chevron" />
      </summary>
      <div className="profile-contact-disclosure-content">{children}</div>
    </details>
  );
}
