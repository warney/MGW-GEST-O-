import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store, max-age=0","Pragma":"no-cache"}});
function fromBase64(value:string):Uint8Array{const binary=atob(value);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
function decodeClaims(jwt:string):Record<string,unknown>{const part=jwt.split(".")[1];if(!part)throw new Error("JWT invalido");const p=part.replace(/-/g,"+").replace(/_/g,"/");return JSON.parse(atob(p.padEnd(Math.ceil(p.length/4)*4,"=")));}
async function decryptPixKey(value:string,secret:string):Promise<string>{
 const raw=fromBase64(secret);if(raw.length!==32)throw new Error("Chave criptografica invalida");
 const [version,ivPart,cipherPart]=value.split(".");if(version!=="v1"||!ivPart||!cipherPart)throw new Error("Ciphertext invalido");
 const key=await crypto.subtle.importKey("raw",toArrayBuffer(raw),"AES-GCM",false,["decrypt"]);
 const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:toArrayBuffer(fromBase64(ivPart))},key,toArrayBuffer(fromBase64(cipherPart)));
 return new TextDecoder().decode(clear);
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return json({error:"Metodo nao permitido."},405);
 const url=Deno.env.get("SUPABASE_URL")||"",anon=Deno.env.get("SUPABASE_ANON_KEY")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",encryptionKey=Deno.env.get("MGW_PARTNER_PIX_ENCRYPTION_KEY")||"";
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!url||!anon||!serviceKey||!encryptionKey)return json({error:"Servico de consulta Pix ainda nao configurado."},503);
 if(!jwt)return json({error:"Sessao administrativa nao encontrada."},401);
 try{
  const claims=decodeClaims(jwt);if(claims.aal!=="aal2")return json({error:"MFA/AAL2 obrigatorio para revelar a chave Pix."},403);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser(jwt);const user=authData.user;
  if(authError||!user?.id||!user.email_confirmed_at||claims.sub!==user.id)return json({error:"Sessao invalida ou e-mail nao confirmado."},401);
  const body=await req.json() as Record<string,unknown>;const partnerId=typeof body.partnerId==="string"?body.partnerId:"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(partnerId))return json({error:"Parceiro invalido."},400);
  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:admin,error:adminError}=await service.from("platform_admins").select("user_id,role,active").eq("user_id",user.id).eq("role","super_admin").eq("active",true).maybeSingle();
  if(adminError||!admin)return json({error:"Acesso restrito ao Superadmin."},403);
  const {error:auditError}=await userClient.rpc("admin_audit_mgw_partner_pix_access",{p_partner_id:partnerId});
  if(auditError)return json({error:"Consulta bloqueada pela validacao administrativa/MFA."},403);
  const {data:profile,error:profileError}=await service.from("mgw_partner_payout_profiles").select("pix_key_ciphertext,pix_key_type,holder_name").eq("partner_id",partnerId).maybeSingle();
  if(profileError||!profile)return json({error:"Chave Pix nao cadastrada."},404);
  const pix_key=await decryptPixKey(profile.pix_key_ciphertext,encryptionKey);
  return json({pix_key,pix_key_type:profile.pix_key_type,holder_name:profile.holder_name});
 }catch(error){console.error("[admin-partner-pix] erro:",error instanceof Error?error.message:"unknown");return json({error:"Nao foi possivel consultar a chave Pix."},500);}
});
