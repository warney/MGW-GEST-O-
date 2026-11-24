declare module 'https://esm.sh/@supabase/supabase-js@2.49.4' {
  export * from '@supabase/supabase-js';
}

declare module 'npm:web-push@3.6.7' {
  export interface PushSubscriptionKeys {
    p256dh: string;
    auth: string;
  }

  export interface PushSubscription {
    endpoint: string;
    keys: PushSubscriptionKeys;
  }

  export interface SendResult {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
  }

  export interface PushSendOptions {
    TTL?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    topic?: string;
    headers?: Record<string, string>;
  }

  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: PushSubscription,
      payload?: string | Uint8Array | null,
      options?: PushSendOptions,
    ): Promise<SendResult>;
  };

  export default webpush;
}

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
