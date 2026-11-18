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

  // Characterization of the default page, taken before the ticket tool and the
  // app name become options: the default output must not change.
  it.each([false, true])(
    'renders the default page, adjustable %s',
    (adjustable) => {
      expect(
        uploadWidgetHtml('https://api.example.com', adjustable)
      ).toMatchSnapshot();
    }
  );

  it('takes the ticket tool and the app name as options', () => {
    const html = uploadWidgetHtml('https://api.example.com', false, {
      ticketTool: 'get_upload_ticket',
      app: 'sharek-upload',
    });

    expect(html).toContain('get_upload_ticket');
    expect(html).toContain('sharek-upload');
    expect(html).not.toContain('uploadWidgetTicketTool');
    expect(html).not.toContain('postiz-upload');
  });
});
