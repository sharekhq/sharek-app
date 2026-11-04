// The storage client and the signer are the doubles: each case makes the
// storage call fail. The factory the module loads drags in the storage
// providers; none of that code runs here.
const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  ...jest.requireActual('@aws-sdk/client-s3'),
  S3Client: class {
    send = mockSend;
  },
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

import {
  abortMultipartUpload,
  completeMultipartUpload,
  listParts,
  prepareUploadParts,
} from './r2.uploader';

// The upload routes are open to every signed-in user, and the storage error
// names the bucket, the key and the request ids.
describe('r2.uploader, a storage failure', () => {
  const failure = Object.assign(new Error('The upload does not exist'), {
    Code: 'NoSuchUpload',
    Bucket: 'sharek-bucket',
    $metadata: { requestId: 'request-1' },
  });
  const upload = { key: 'file.png', uploadId: 'upload-1' };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockSend.mockRejectedValue(failure);
    mockGetSignedUrl.mockRejectedValue(failure);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      'prepareUploadParts',
      prepareUploadParts,
      { partData: { ...upload, parts: [{ number: 1 }] } },
    ],
    ['listParts', listParts, upload],
    ['completeMultipartUpload', completeMultipartUpload, upload],
    ['abortMultipartUpload', abortMultipartUpload, upload],
  ])(
    '%s answers 500 without the error itself',
    async (_name, handler, body) => {
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

      await handler({ body } as any, res as any);

      expect(res.status).toHaveBeenCalledWith(500);
      // createMultipartUpload's answer to the same failure
      expect(res.json).toHaveBeenCalledWith({ source: { status: 500 } });
    }
  );
});
