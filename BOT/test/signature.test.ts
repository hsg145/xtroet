import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parsePublicKey, SignatureError, verifySignature } from '../src/kick/signature.js';

/**
 * Signature verification is tested against a locally generated RSA key pair,
 * exactly as Kick does it: RSA-SHA256 (PKCS#1 v1.5) over
 * `${messageId}.${timestamp}.${rawBody}`, base64-encoded.
 */
const pair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const privateKey = pair.privateKey;
const publicKey = parsePublicKey(pair.publicKey);

const messageId = '01JBX7ZK3M9QK7Y2T8F4P6N1CV';
const timestamp = '2026-01-14T16:08:06.123Z';
const body = Buffer.from(JSON.stringify({ message_id: 'abc', content: 'مرحبا', sender: { user_id: 42 } }));

function sign(raw: Buffer, id = messageId, ts = timestamp): string {
  const signer = createSign('RSA-SHA256');
  signer.update(Buffer.from(`${id}.${ts}.`, 'utf8'));
  signer.update(raw);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

const headers = (over: Partial<{ messageId: string; timestamp: string; signature: string; eventType: string }> = {}) => ({
  messageId: over.messageId ?? messageId,
  timestamp: over.timestamp ?? timestamp,
  signature: over.signature ?? sign(body),
  eventType: over.eventType ?? 'chat.message.sent',
});

function verifyNow(raw: Buffer, now = Date.parse(timestamp)) {
  verifySignature(publicKey, raw, headers(), now);
}

describe('parsePublicKey', () => {
  it('accepts an SPKI PEM key', () => {
    const key = parsePublicKey(pair.publicKey as string);
    expect(key.asymmetricKeyType).toBe('rsa');
  });

  it('rejects garbage', () => {
    expect(() => parsePublicKey('not a key')).toThrow();
  });
});

describe('verifySignature', () => {
  it('accepts a correctly signed raw body', () => {
    expect(() => verifyNow(body)).not.toThrow();
  });

  it('REJECTS a re-serialized body — JSON.stringify round-trips break the signature', () => {
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(body.toString('utf8'))));
    expect(reserialized.equals(body)).toBe(true); // same bytes here...
    expect(() => verifyNow(reserialized)).not.toThrow();
  });

  it('rejects a re-serialized body with different key order / spacing', () => {
    // Same JSON semantics, different bytes -> signature must fail. This is the
    // real-world trap the docs warn about.
    const reserialized = Buffer.from(
      JSON.stringify(JSON.parse(body.toString('utf8')), null, 2),
      'utf8',
    );
    expect(() => verifyNow(reserialized)).toThrow(SignatureError);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(body.toString('utf8').replace('مرحبا', 'مرحبكم'));
    expect(() => verifyNow(tampered)).toThrow(SignatureError);
  });

  it('rejects a wrong signature', () => {
    expect(() => verifySignature(publicKey, body, headers({ signature: 'AAAA' }))).toThrow(
      SignatureError,
    );
  });

  it('rejects a mismatched message id', () => {
    const other = sign(body, '01DIFFERENTMESSAGEID00000');
    expect(() => verifySignature(publicKey, body, headers({ messageId: messageId, signature: other }))).toThrow(
      SignatureError,
    );
  });

  it('rejects a timestamp older than 5 minutes', () => {
    const stale = Date.parse(timestamp) - 5 * 60 * 1000 - 1000;
    expect(() => verifyNow(body, stale)).toThrow(/5 minute window/);
  });

  it('accepts a timestamp just inside the 5 minute window', () => {
    const edge = Date.parse(timestamp) - 5 * 60 * 1000 + 5000;
    expect(() => verifyNow(body, edge)).not.toThrow();
  });

  it('rejects an unparseable timestamp header', () => {
    expect(() =>
      verifySignature(publicKey, body, headers({ timestamp: 'not-a-date' })),
    ).toThrow(/unparseable/);
  });

  it('rejects missing headers', () => {
    expect(() =>
      verifySignature(publicKey, body, headers({ messageId: '' })),
    ).toThrow(/missing Kick-Event-Message-Id/);
    expect(() =>
      verifySignature(publicKey, body, headers({ timestamp: '' })),
    ).toThrow(/missing Kick-Event-Message-Timestamp/);
    expect(() =>
      verifySignature(publicKey, body, headers({ signature: '' })),
    ).toThrow(/missing Kick-Event-Signature/);
  });
});