// Firebase Cloud Messaging HTTP v1
type Fetch = typeof fetch;

export interface PushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
  sound?: boolean;
}

export type PushResult = 'ok' | 'invalid' | 'retry';

export interface Pusher {
  send(token: string, p: PushPayload): Promise<PushResult>;
}

export class Fcm implements Pusher {
  constructor(private readonly projectId: string, private readonly token: () => Promise<string>, private readonly f: Fetch = fetch) {}

  async send(deviceToken: string, p: PushPayload): Promise<PushResult> {
    const res = await this.f(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${await this.token()}` },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: p.title, body: p.body },
          data: p.data,
          android: { priority: 'high', notification: { channel_id: p.sound ? 'orders_sound' : 'general', ...(p.sound ? { sound: 'new_order' } : {}) } },
          webpush: { headers: { Urgency: 'high' } },
        },
      }),
    });
    if (res.ok) return 'ok';
    const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } };
    const code = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status ?? '';
    if (code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT' || res.status === 404) return 'invalid';
    return 'retry';
  }
}

export class MemoryPusher implements Pusher {
  sent: Array<{ token: string; p: PushPayload }> = [];
  invalid = new Set<string>();
  failing = new Set<string>();
  async send(token: string, p: PushPayload): Promise<PushResult> {
    if (this.invalid.has(token)) return 'invalid';
    if (this.failing.has(token)) return 'retry';
    this.sent.push({ token, p });
    return 'ok';
  }
}
