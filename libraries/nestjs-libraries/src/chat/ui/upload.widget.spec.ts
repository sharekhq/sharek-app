// The size hint reads the upload limits; they are not under test.
jest.mock('@gitroom/nestjs-libraries/upload/custom.upload.validation', () => ({
  getMaxSize: () => 10 * 1024 * 1024,
}));

import { uploadWidgetHtml } from './upload.widget';

describe('the upload widget', () => {
  it('shows no adjust checkbox while the media processor is off', () => {
    const html = uploadWidgetHtml('https://api.example.com', false);

    expect(html).not.toContain('id="adjust"');
    expect(html).not.toContain('Adjust media to platform limits');
  });

  // The upload reads the checkbox; without it the read must not throw.
  it('reads the checkbox only when it is there', () => {
    expect(uploadWidgetHtml('https://api.example.com', false)).toContain(
      'var adjust = !!adjustBox && adjustBox.checked;'
    );
  });

  it('shows the checkbox while the processor is on', () => {
    const html = uploadWidgetHtml('https://api.example.com', true);

    expect(html).toContain('<input id="adjust" type="checkbox" />');
    expect(html).toContain('Adjust media to platform limits');
  });
});
