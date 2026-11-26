import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, max-age=0","Pragma":"no-cache"}});
function decodeClaims(jwt:string):Record<string,unknown>{const part=jwt.split(".")[1];if(!part)throw new Error("JWT inválido");const value=part.replace(/-/g,"+").replace(/_/g,"/");const bin=atob(value.padEnd(Math.ceil(value.length/4)*4,"="));return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))));}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Método não permitido."},405);
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!url||!anon||!serviceKey)return json({error:"Serviço de consulta Pix indisponível."},503);
 if(!jwt)return json({error:"Sessão administrativa não encontrada."},401);
 try{
  const claims=decodeClaims(jwt);
  if(claims.aal!=="aal2")return json({error:"MFA/AAL2 obrigatório para revelar a chave Pix."},403);
  const userDb=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userDb.auth.getUser(jwt);const user=authData.user;
  if(authError||!user?.id||!user.email_confirmed_at||claims.sub!==user.id)return json({error:"Sessão inválida ou e-mail não confirmado."},401);
  const body=await req.json() as Record<string,unknown>;const partnerId=typeof body.partnerId==="string"?body.partnerId:"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(partnerId))return json({error:"Parceiro inválido."},400);
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:admin,error:adminError}=await service.from("platform_admins").select("user_id,role,active").eq("user_id",user.id).eq("role","super_admin").eq("active",true).maybeSingle();
  if(adminError||!admin)return json({error:"Acesso restrito ao Superadmin."},403);
  const {error:auditError}=await userDb.rpc("admin_audit_mgw_partner_pix_access",{p_partner_id:partnerId});
  if(auditError)return json({error:"Consulta bloqueada pela validação administrativa/MFA."},403);
  const {data:profile,error:profileError}=await service.from("mgw_partner_payout_profiles").select("pix_key,pix_key_type,holder_name").eq("partner_id",partnerId).maybeSingle();
  if(profileError){console.error("[admin-partner-pix] query failed:",profileError.message);return json({error:"Não foi possível consultar o cadastro Pix."},500);}
  if(!profile)return json({error:"Chave Pix não cadastrada."},404);
  return json({pix_key:profile.pix_key,pix_key_type:profile.pix_key_type,holder_name:profile.holder_name});
 }catch(error){console.error("[admin-partner-pix] unexpected error:",error instanceof Error?error.message:"unknown");return json({error:"Não foi possível consultar a chave Pix."},500);}
});