function base64UrlEncode(input: string): string {
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const raw = atob(padded);
  return decodeURIComponent(escape(raw));
}

export function encodeProjectId(id: string): string {
  return base64UrlEncode(id);
}

export function decodeProjectId(encoded: string): string | null {
  try {
    return base64UrlDecode(encoded);
  } catch {
    return null;
  }
}

