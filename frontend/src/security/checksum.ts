export async function checksumOf(armoredMessage: string): Promise<string> {
  const data = new TextEncoder().encode(armoredMessage);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}
