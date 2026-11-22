import followRedirects from 'follow-redirects';

const { https } = followRedirects;

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * POSTs to the SMS gateway (`hostname` + `path`, the query string carrying the fields)
 * and resolves with the raw response body. Redirects are followed. Over HTTPS, because
 * the path carries the API key and the message text.
 *
 * Rejects on a network error, a broken response or after 15 seconds without an answer,
 * so a caller never waits forever.
 */
export function bulkSmsRequest(hostname: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { method: 'POST', hostname, path, headers: {}, maxRedirects: 20 },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString()));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(Object.assign(new Error('SMS gateway timed out'), { name: 'TimeoutError' }));
    });
    req.end();
  });
}
