/**
 * Thin fetch layer for the Panelist server. Same-origin, cookie auth.
 * A 401 anywhere flips the app to the login gate via `onUnauthorized`.
 */

export class ApiError extends Error {
  status: number;
  retryAfter?: number;
  constructor(status: number, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

let unauthorized: (() => void) | null = null;
export function onUnauthorized(handler: () => void): void {
  unauthorized = handler;
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init.headers,
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    ...init,
  });
  // A 401 from any route but login means the session is gone; from login it is a wrong password.
  if (res.status === 401 && path !== '/api/login') {
    unauthorized?.();
    throw new ApiError(401, 'Not signed in');
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* not JSON */
    }
    const retry = Number(res.headers.get('Retry-After') ?? '');
    throw new ApiError(res.status, message, Number.isFinite(retry) ? retry : undefined);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface RecordOut {
  review_id: string;
  key: string;
  data: unknown;
  updated_at: number;
  deleted: boolean;
}
export interface AccountRecordOut {
  key: string;
  data: unknown;
  updated_at: number;
  deleted: boolean;
}
export interface ReviewOut {
  id: string;
  created_at: number;
  updated_at: number;
  deleted: boolean;
}
export interface Changes {
  seq: number;
  reviews: ReviewOut[];
  records: RecordOut[];
  account: AccountRecordOut[];
}
export interface ChangesIn {
  reviews?: ReviewOut[];
  records?: RecordOut[];
  account?: AccountRecordOut[];
}

/** The signed-in account, as the server describes it. */
export interface Me {
  id: string;
  email: string;
  isAdmin: boolean;
  mustChangePassword: boolean;
}

export interface PasskeyInfo {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export interface SessionInfo {
  id: string;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

export interface AdminUser extends Me {
  disabled: boolean;
  createdAt: number;
  lastLoginAt: number | null;
}

export const api = {
  /** The signed-in account, or null when the session cookie is missing or stale. Throws on network failure. */
  async session(): Promise<Me | null> {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (res.status === 401) return null;
    if (!res.ok) throw new ApiError(res.status, 'Server error');
    return (await res.json()) as Me;
  },
  login: (email: string, password: string) => request<Me>('POST', '/api/login', { email, password }),
  logout: () => request<{ ok: boolean }>('POST', '/api/logout', {}),
  logoutEverywhere: () => request<{ ok: boolean }>('POST', '/api/logout-everywhere', {}),
  changePassword: (current: string, next: string) => request<Me>('POST', '/api/password', { current, new: next }),
  passkeys: {
    registerOptions: () => request<{ challengeId: string; options: Record<string, unknown> }>('POST', '/api/passkeys/register/options', {}),
    register: (challengeId: string, credential: Record<string, unknown>, label: string) => request<{ passkey: PasskeyInfo }>('POST', '/api/passkeys/register', { challengeId, credential, label }),
    list: () => request<{ passkeys: PasskeyInfo[] }>('GET', '/api/passkeys'),
    remove: (id: string) => request<{ ok: boolean }>('DELETE', `/api/passkeys/${encodeURIComponent(id)}`),
    loginOptions: (email: string) => request<{ challengeId: string; options: Record<string, unknown> }>('POST', '/api/passkeys/login/options', { email }),
    login: (challengeId: string, credential: Record<string, unknown>) => request<Me>('POST', '/api/passkeys/login', { challengeId, credential }),
  },
  sessions: {
    list: () => request<{ sessions: SessionInfo[] }>('GET', '/api/sessions'),
    end: (id: string) => request<{ ok: boolean }>('DELETE', `/api/sessions/${encodeURIComponent(id)}`),
  },
  inbox: {
    status: () => request<{ configured: boolean }>('GET', '/api/inbox/token'),
    create: () => request<{ token: string }>('POST', '/api/inbox/token', {}),
    revoke: () => request<{ ok: boolean }>('DELETE', '/api/inbox/token'),
  },
  admin: {
    users: () => request<{ users: AdminUser[] }>('GET', '/api/admin/users'),
    create: (email: string, isAdmin = false) => request<{ user: AdminUser; temporaryPassword: string }>('POST', '/api/admin/users', { email, isAdmin }),
    reset: (id: string) => request<{ user: AdminUser; temporaryPassword: string }>('POST', `/api/admin/users/${encodeURIComponent(id)}/reset`, {}),
    update: (id: string, patch: { disabled?: boolean; isAdmin?: boolean }) => request<{ user: AdminUser }>('PATCH', `/api/admin/users/${encodeURIComponent(id)}`, patch),
    remove: (id: string) => request<{ ok: boolean; reviewsRemoved: number }>('DELETE', `/api/admin/users/${encodeURIComponent(id)}`),
  },
  pull: (since: number) => request<Changes>('GET', `/api/changes?since=${since}`),
  push: (changes: ChangesIn) => request<{ ok: boolean; applied: number; seq: number }>('POST', '/api/changes', changes),
  deleteReview: (id: string) => request<{ ok: boolean }>('DELETE', `/api/reviews/${encodeURIComponent(id)}`),
  fileExists: async (reviewId: string, docId: string): Promise<boolean> => {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/files/${encodeURIComponent(docId)}`, { method: 'HEAD', credentials: 'same-origin' });
    if (res.status === 401) unauthorized?.();
    return res.ok;
  },
  /** Upload a PDF with progress, via XHR because fetch cannot report upload progress. */
  uploadFile(reviewId: string, docId: string, file: Blob, onProgress?: (fraction: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/reviews/${encodeURIComponent(reviewId)}/files/${encodeURIComponent(docId)}`);
      xhr.withCredentials = true;
      xhr.setRequestHeader('Content-Type', 'application/pdf');
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status === 401) {
          unauthorized?.();
          reject(new ApiError(401, 'Not signed in'));
        } else if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let msg = `Upload failed (${xhr.status})`;
          try {
            msg = (JSON.parse(xhr.responseText) as { error?: string }).error ?? msg;
          } catch {
            /* ignore */
          }
          reject(new ApiError(xhr.status, msg));
        }
      };
      xhr.onerror = () => reject(new ApiError(0, 'Network error during upload'));
      xhr.send(file);
    });
  },
  reflowStatus: (reviewId: string, docId: string) => request<import('./reflow/types').ReflowStatus>('GET', `/api/reviews/${encodeURIComponent(reviewId)}/docs/${encodeURIComponent(docId)}/reflow`),
  startReflow: (reviewId: string, docId: string, pages?: number[], force = false) =>
    request<import('./reflow/types').ReflowStatus>('POST', `/api/reviews/${encodeURIComponent(reviewId)}/docs/${encodeURIComponent(docId)}/reflow`, { pages: pages ?? null, force }),
  reflowDoc: (reviewId: string, docId: string) => request<import('./reflow/types').ReflowDoc>('GET', `/api/reviews/${encodeURIComponent(reviewId)}/docs/${encodeURIComponent(docId)}/reflow/doc.json`),
  /** Positioned text per page, extracted on the server alongside the reflow. */
  reflowPages: (reviewId: string, docId: string) => request<{ version: number; pages: import('./types').PageText[] }>('GET', `/api/reviews/${encodeURIComponent(reviewId)}/docs/${encodeURIComponent(docId)}/reflow/pages.json`),
  figureUrl: (reviewId: string, docId: string, src: string) => `/api/reviews/${encodeURIComponent(reviewId)}/docs/${encodeURIComponent(docId)}/reflow/${src}`,
  async downloadFile(reviewId: string, docId: string): Promise<Blob> {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/files/${encodeURIComponent(docId)}`, { credentials: 'same-origin' });
    if (res.status === 401) {
      unauthorized?.();
      throw new ApiError(401, 'Not signed in');
    }
    if (!res.ok) throw new ApiError(res.status, 'That PDF is not on the server yet.');
    return res.blob();
  },
};
