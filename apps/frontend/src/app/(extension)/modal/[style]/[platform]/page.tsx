'use client';

import { StandaloneModal } from '@gitroom/frontend/components/standalone-modal/standalone.modal';
export default function Modal() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-black">
      {/* The inset cancels compose's own padding so the modal fills the frame,
          which means it has to track that padding rather than assume it:
          manage.modal.tsx:483 drops from 40px to 12px under `mobile:`, and a
          compensation stuck at 40 pushes 28px of compose off each edge of this
          `overflow-hidden` parent. Measured at 390 on build 127dbaa2 — 18
          clipped boxes against 2, the segment bar among them. */}
      <div className="text-textColor h-[calc(100vh+80px)] w-[calc(100vw+80px)] -m-[40px] mobile:h-[calc(100vh+24px)] mobile:w-[calc(100vw+24px)] mobile:-m-[12px]">
        <StandaloneModal />
      </div>
    </div>
  );
}
