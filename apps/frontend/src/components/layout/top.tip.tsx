'use client';

import { useState } from 'react';
import { Tooltip } from 'react-tooltip';
import {
  NO_HOVER_QUERY,
  useMediaQuery,
} from '@gitroom/react/helpers/use.media.query';

// The control an anchor belongs to: an icon in a menu item reads with the
// item's label beside it.
const CONTROL = 'a, button, [role="button"], [role="menuitem"]';

const normalize = (text: string) =>
  text.replace(/\s+/g, ' ').trim().toLowerCase();

// What the element shows as text; an SVG icon shows none.
const visibleText = (element: Element) =>
  element instanceof HTMLElement ? element.innerText : '';

// Text cut short by an ellipsis or a line clamp is not shown in full.
const clipsText = (element: Element) =>
  window.getComputedStyle(element).overflow !== 'visible' &&
  (element.scrollWidth > element.clientWidth ||
    element.scrollHeight > element.clientHeight);

// The control under the pointer already reads the tooltip's text in full, so
// the tooltip would only repeat it.
const repeatsControl = (anchor: HTMLElement, content: string) => {
  const control = anchor.closest(CONTROL) ?? anchor;
  return (
    normalize(visibleText(control)).includes(normalize(content)) &&
    ![control, ...Array.from(control.querySelectorAll('*'))].some(clipsText)
  );
};

export const ToolTip = () => {
  // A touch screen has no hover: a tap fired the events that open the tooltip,
  // and it stayed over whatever the tap opened. Controls keep their aria-label.
  const noHover = useMediaQuery(NO_HOVER_QUERY);
  // react-tooltip calls `render` when its active anchor changes, and hovering
  // the same control twice keeps it active while its text may have changed in
  // between (the customer picker once a customer is picked). Following the
  // open state renders again each time the tooltip opens, so the anchor is
  // read as it is then.
  const [, setOpen] = useState(false);
  // Above the modal stack, which starts at 200 and adds one per stacked modal
  // (new-modal.tsx). At z-200 this tie-broke by DOM order for tooltips on the
  // page or in a first-level modal, but anything opened from inside a modal —
  // the AI image modal from the composer — painted over the tooltip entirely.
  // 700 also clears the 300-600 in-app overlays and dropdowns, and stays under
  // the impersonation bar; the tooltip is pointer-events-none, so nothing
  // underneath becomes unclickable.
  return (
    <Tooltip
      className="z-[700]"
      id="tooltip"
      hidden={noHover}
      setIsOpen={setOpen}
      render={({ content, activeAnchor }) =>
        content && activeAnchor && repeatsControl(activeAnchor, content)
          ? null
          : content
      }
    />
  );
};
