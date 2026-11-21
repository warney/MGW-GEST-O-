import { getSupabaseClient } from '../lib/supabase';

export async function createMercadoPagoTestCheckout(tenantId: string): Promise<string> {
  const cleanTenantId = tenantId.trim();
  if (!cleanTenantId) throw new Error('Não foi possível identificar o estabelecimento.');

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke('create-mp-subscription', {
    body: { tenantId: cleanTenantId },
  });
  if (error) {
    throw new Error(error.message || 'Não foi possível iniciar o checkout.');
  }
  const checkoutUrl = data?.checkoutUrl;
  if (typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) {
    throw new Error(data?.error || 'O Mercado Pago não retornou um link de checkout válido.');
  }
  return checkoutUrl;
}
