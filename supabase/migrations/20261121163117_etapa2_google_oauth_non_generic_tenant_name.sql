-- Avoid creating Google OAuth tenants with the generic "Meu Estabelecimento" name.
-- Prefer an explicit shop_name, then provider profile name, then email local-part.
DO $$
DECLARE
  v_def text;
  v_old text := $old$
  IF v_name = '' THEN
    v_name := 'Meu Estabelecimento';
  END IF;
$old$;
  v_new text := $new$
  IF v_name = '' THEN
    v_name := left(coalesce(
      nullif(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(split_part(coalesce(NEW.email, ''), '@', 1)), ''),
      'Estabelecimento'
    ), 80);
  END IF;
$new$;
BEGIN
  SELECT pg_get_functiondef('public.provision_new_mgw_owner()'::regprocedure) INTO v_def;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'Fallback de nome esperado não encontrado em provision_new_mgw_owner; nenhuma alteração aplicada.';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END;
$$;
