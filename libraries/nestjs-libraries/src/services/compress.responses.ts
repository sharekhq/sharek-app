import compression from 'compression';
import { Request, Response } from 'express';

// Server-sent events stay uncompressed: Samy's and the post editor's AI replies
// are written as events while the model produces them, and compression holds
// its output until the response ends unless the writer flushes, which
// CopilotKit never does. Compressed, a reply would only appear once finished.
const shouldCompress = (req: Request, res: Response) =>
  !String(res.getHeader('Content-Type') ?? '').startsWith(
    'text/event-stream'
  ) && compression.filter(req, res);

export const compressResponses = () => compression({ filter: shouldCompress });
