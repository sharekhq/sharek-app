import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useForm, FormProvider } from 'react-hook-form';

// Spec 060 (T026, FR-027): Studio's prompt box (Veo 3 and Slides) types at 14px
// with a mouse, as every other box in Studio's tool windows does, and keeps the
// shared box's 16px under a finger so iOS Safari doesn't zoom on focus.
//
// t returns the English default it is given.
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));

import { VideoPromptField } from '@gitroom/frontend/components/videos/video.modal.parts';

const Harness = () => {
  const form = useForm();
  return (
    <FormProvider {...form}>
      <VideoPromptField placeholder="Describe it" />
    </FormProvider>
  );
};

const mount = () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    createRoot(container).render(<Harness />);
  });
  return container;
};

describe('the video prompt box', () => {
  it('types at 14px with a mouse and 16px under a finger', () => {
    const textarea = mount().querySelector('textarea')!;
    const classes = textarea.className.split(/\s+/);

    expect(classes).toEqual(
      expect.arrayContaining(['text-[14px]', 'coarse:text-[16px]'])
    );
  });

  // Guard: the shared box's own height is kept.
  it('keeps the shared box height', () => {
    const textarea = mount().querySelector('textarea')!;

    expect(textarea.className.split(/\s+/)).toContain('min-h-[150px]');
  });
});
