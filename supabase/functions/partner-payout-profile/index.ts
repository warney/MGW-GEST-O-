import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, max-age=0"}});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Método não permitido."},405);
 const url=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!url||!serviceKey)return json({error:"Serviço de recebimento indisponível."},503);
 if(!jwt)return json({error:"Sessão não encontrada."},401);
 try{
  const body=await req.json() as Record<string,unknown>;
  const pixKey=typeof body.pixKey==="string"?body.pixKey.trim():"";
  const pixKeyType=typeof body.pixKeyType==="string"?body.pixKeyType:"";
  const holderName=typeof body.holderName==="string"?body.holderName.trim():"";
  if(pixKey.length<3||pixKey.length>160||!["cpf","cnpj","email","phone","random"].includes(pixKeyType)||holderName.length<2||holderName.length>120)return json({error:"Confira o tipo de chave, a chave Pix e o titular."},400);
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await db.auth.getUser(jwt);
  if(authError||!auth.user?.id||!auth.user.email_confirmed_at)return json({error:"Sessão inválida ou e-mail não confirmado."},401);
  const {data:partner,error:partnerError}=await db.from("mgw_partners").select("id,status").eq("user_id",auth.user.id).maybeSingle();
  if(partnerError||!partner||partner.status!=="active")return json({error:"Conta de parceiro ativa não encontrada."},403);
  const {error:saveError}=await db.from("mgw_partner_payout_profiles").upsert({partner_id:partner.id,pix_key:pixKey,pix_key_type:pixKeyType,holder_name:holderName,updated_at:new Date().toISOString()},{onConflict:"partner_id"});
  if(saveError){console.error("[partner-payout-profile] save failed:",saveError.message);return json({error:"Não foi possível salvar os dados de recebimento."},500);}
  return json({saved:true});
 }catch(error){console.error("[partner-payout-profile] unexpected error:",error instanceof Error?error.message:"unknown");return json({error:"Falha interna ao salvar os dados Pix."},500);}
});