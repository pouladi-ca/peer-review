/**
 * WebAuthn plumbing: turn the server's JSON options into what the browser wants, and the
 * browser's credential back into JSON. Base64url everywhere, as the standard specifies.
 */

const toBytes = (b64url: string): Uint8Array<ArrayBuffer> => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const toB64url = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** True when this browser can create and use passkeys. */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && typeof navigator.credentials?.create === 'function';
}

type JsonOptions = Record<string, unknown>;

function toCreationOptions(o: JsonOptions): PublicKeyCredentialCreationOptions {
  const user = o.user as { id: string; name: string; displayName: string };
  return {
    ...(o as unknown as PublicKeyCredentialCreationOptions),
    challenge: toBytes(o.challenge as string),
    user: { ...user, id: toBytes(user.id) },
    excludeCredentials: ((o.excludeCredentials as { id: string; type: string; transports?: string[] }[]) ?? []).map((c) => ({ ...c, id: toBytes(c.id) })) as PublicKeyCredentialDescriptor[],
  };
}

function toRequestOptions(o: JsonOptions): PublicKeyCredentialRequestOptions {
  return {
    ...(o as unknown as PublicKeyCredentialRequestOptions),
    challenge: toBytes(o.challenge as string),
    allowCredentials: ((o.allowCredentials as { id: string; type: string; transports?: string[] }[]) ?? []).map((c) => ({ ...c, id: toBytes(c.id) })) as PublicKeyCredentialDescriptor[],
  };
}

/** Ask the authenticator to create a passkey for the options the server issued. */
export async function createPasskey(options: JsonOptions): Promise<Record<string, unknown>> {
  const cred = (await navigator.credentials.create({ publicKey: toCreationOptions(options) })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was created.');
  const r = cred.response as AuthenticatorAttestationResponse;
  const transports = typeof r.getTransports === 'function' ? r.getTransports() : [];
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: (cred as PublicKeyCredential & { authenticatorAttachment?: string }).authenticatorAttachment ?? null,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: { clientDataJSON: toB64url(r.clientDataJSON), attestationObject: toB64url(r.attestationObject), transports },
  };
}

/** Sign the server's challenge with a passkey. */
export async function signWithPasskey(options: JsonOptions): Promise<Record<string, unknown>> {
  const cred = (await navigator.credentials.get({ publicKey: toRequestOptions(options) })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was chosen.');
  const r = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: toB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: (cred as PublicKeyCredential & { authenticatorAttachment?: string }).authenticatorAttachment ?? null,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: toB64url(r.clientDataJSON),
      authenticatorData: toB64url(r.authenticatorData),
      signature: toB64url(r.signature),
      userHandle: r.userHandle ? toB64url(r.userHandle) : null,
    },
  };
}
