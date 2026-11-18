import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DataProviderMode } from '../types/finance';

export interface SupabaseConfigStatus {
  configured: boolean;
  missing: string[];
  url: string | null;
}

const PLACEHOLDER_MARKERS = [
  'YOUR_PROJECT_REF',
  'YOUR_SUPABASE_ANON_KEY',
  'YOUR_SUPABASE_PUBLISHABLE_KEY',
];

function isRealEnvValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_MARKERS.some((marker) => trimmed.includes(marker));
}

function readSupabasePublicEnv(): { url: string | null; anonKey: string | null } {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  const rawUrl = env.VITE_SUPABASE_URL;
  const rawKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const url = isRealEnvValue(rawUrl) ? rawUrl.trim() : null;
  const anonKey = isRealEnvValue(rawKey) ? rawKey.trim() : null;

  return { url, anonKey };
}

export function getSupabaseConfigStatus(): SupabaseConfigStatus {
  const { url, anonKey } = readSupabasePublicEnv();
  const missing: string[] = [];

  if (!url) {
    missing.push('VITE_SUPABASE_URL');
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        missing.push('VITE_SUPABASE_URL (protocolo invalido)');
      }
    } catch {
      missing.push('VITE_SUPABASE_URL (URL invalida)');
    }
  }

  if (!anonKey) {
    missing.push('VITE_SUPABASE_ANON_KEY');
  }

  return {
    configured: missing.length === 0 && Boolean(url && anonKey),
    missing,
    url,
  };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfigStatus().configured;
}

/**
 * Resolve qual provedor unico deve estar ativo no runtime (nunca grava em dois bancos).
 * - Se VITE_DATA_PROVIDER="firebase", mantem Firebase ativo (rollback seguro).
 * - Se VITE_DATA_PROVIDER="supabase", exige configuracao valida do Supabase.
 * - Se nao definido, ativa Supabase somente quando VITE_SUPABASE_URL e
 *   VITE_SUPABASE_ANON_KEY estiverem configurados com valores reais; caso contrario
 *   preserva o Firebase funcionando sem quebrar o aplicativo atual.
 */
export function getActiveDataProvider(): DataProviderMode {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {};
  const explicit =
    typeof env.VITE_DATA_PROVIDER === 'string'
      ? env.VITE_DATA_PROVIDER.trim().toLowerCase()
      : '';

  if (explicit === 'firebase') {
    return 'firebase';
  }
  if (explicit === 'supabase') {
    return 'supabase';
  }
  return isSupabaseConfigured() ? 'supabase' : 'firebase';
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const status = getSupabaseConfigStatus();
  const { url, anonKey } = readSupabasePublicEnv();

  if (!status.configured || !url || !anonKey) {
    throw new Error(
      `Supabase nao configurado no ambiente Vite. Variaveis ausentes ou invalidas: ${status.missing.join(', ')}.`,
    );
  }

  supabaseInstance = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseInstance;
}

export const SUPABASE_MENU_IMAGES_BUCKET = 'mgw-cardapios';

export interface SupabaseStorageConfig {
  configured: boolean;
  url: string | null;
  anonKey: string | null;
  edgeFunctionUrl: string | null;
  bucket: string;
  missing: string[];
}

export function getSupabaseStorageConfig(): SupabaseStorageConfig {
  const { url, anonKey } = readSupabasePublicEnv();
  const status = getSupabaseConfigStatus();
  const cleanUrl = status.configured && url ? url.replace(/\/+$/, '') : null;

  return {
    configured: status.configured && Boolean(cleanUrl && anonKey),
    url: cleanUrl,
    anonKey: status.configured ? anonKey : null,
    edgeFunctionUrl: cleanUrl ? `${cleanUrl}/functions/v1/menu-storage` : null,
    bucket: SUPABASE_MENU_IMAGES_BUCKET,
    missing: status.missing,
  };
}

