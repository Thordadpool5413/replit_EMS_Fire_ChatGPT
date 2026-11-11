/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { MoveHorizontal } from 'lucide-react';

interface ScrollableTableRegionProps {
  /** Accessible name describing the table, e.g. "Equipment and supplier table". */
  label: string;
  className?: string;
  /** Optional max height utility (e.g. "max-h-64") preserved from the original wrapper. */
  maxHeightClassName?: string;
  testId?: string;
  children: React.ReactNode;
}

/**
 * Keyboard-focusable, labeled horizontal scroll region for wide data tables.
 * On phones a short hint explains that more columns are available, so no data
 * is hidden or clipped; desktop presentation is unchanged.
 */
export const ScrollableTableRegion: React.FC<ScrollableTableRegionProps> = ({
  label,
  className = '',
  maxHeightClassName = '',
  testId,
  children,
}) => (
  <div className={`pi-table-region ${className}`.trim()} data-testid={testId}>
    <p className="pi-table-region__hint" aria-hidden="true">
      <MoveHorizontal className="h-3.5 w-3.5" aria-hidden="true" focusable="false" />
      <span>Swipe for more columns</span>
    </p>
    <div
      className={`pi-table-region__scroller overflow-x-auto ${maxHeightClassName}`.trim()}
      role="region"
      aria-label={`${label}, scrolls horizontally`}
      tabIndex={0}
    >
      {children}
    </div>
  </div>
);
