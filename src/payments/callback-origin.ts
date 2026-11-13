const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export function callbackOrigin(input: {
  apiOrigin?: string;
  renderExternalUrl?: string;
  requestOrigin?: string;
  port?: number;
}) {
  return (
    publicOrigin(input.apiOrigin) ||
    publicOrigin(input.renderExternalUrl) ||
    publicOrigin(input.requestOrigin) ||
    `http://127.0.0.1:${input.port || 3000}`
  );
}

function publicOrigin(value?: string) {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (LOCAL_HOSTS.has(url.hostname)) return undefined;
  if (url.hostname.endsWith('.onrender.com')) url.protocol = 'https:';
  return url.origin;
}
