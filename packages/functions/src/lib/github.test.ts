import { describe, expect, it } from 'vitest';
import {
  extractOrderIdFromIssueBody,
  verifyWebhookSignature,
} from './github.js';

describe('extractOrderIdFromIssueBody', () => {
  it('extracts uuid from gigflow comment', () => {
    const body = `## body\n<!-- gigflow:orderId=11111111-2222-3333-4444-555555555555 -->`;
    expect(extractOrderIdFromIssueBody(body)).toBe(
      '11111111-2222-3333-4444-555555555555',
    );
  });

  it('returns undefined when missing', () => {
    expect(extractOrderIdFromIssueBody('no marker')).toBeUndefined();
  });
});

describe('verifyWebhookSignature', () => {
  it('returns true on matching HMAC', async () => {
    const body = '{"hello":"world"}';
    const secret = 'topsecret';
    // Compute the expected signature using the same algorithm.
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const hex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const ok = await verifyWebhookSignature(body, `sha256=${hex}`, secret);
    expect(ok).toBe(true);
  });

  it('returns false on tampered body', async () => {
    const ok = await verifyWebhookSignature(
      'tampered',
      'sha256=' + 'a'.repeat(64),
      'topsecret',
    );
    expect(ok).toBe(false);
  });

  it('returns false on missing header', async () => {
    expect(await verifyWebhookSignature('x', null, 's')).toBe(false);
  });
});
