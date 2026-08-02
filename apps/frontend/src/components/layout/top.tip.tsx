'use client';

import { Tooltip } from 'react-tooltip';
export const ToolTip = () => {
  // Above the modal stack, which starts at 200 and adds one per stacked modal
  // (new-modal.tsx). At z-200 this tie-broke by DOM order for tooltips on the
  // page or in a first-level modal, but anything opened from inside a modal —
  // the AI image modal from the composer — painted over the tooltip entirely.
  // 700 also clears the 300-600 in-app overlays and dropdowns, and stays under
  // the impersonation bar; the tooltip is pointer-events-none, so nothing
  // underneath becomes unclickable.
  return <Tooltip className="z-[700]" id="tooltip" />;
};
