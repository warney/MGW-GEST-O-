BEGIN;

CREATE OR REPLACE FUNCTION public.validate_establishment_review_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order public.online_orders%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.customer_name_snapshot IS DISTINCT FROM OLD.customer_name_snapshot
    OR NEW.is_verified_purchase IS DISTINCT FROM OLD.is_verified_purchase
    OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
    OR NEW.rating IS DISTINCT FROM OLD.rating
    OR NEW.comment IS DISTINCT FROM OLD.comment
  ) THEN
    RAISE EXCEPTION 'A avaliação enviada não pode ser editada.';
  END IF;

  SELECT * INTO v_order
  FROM public.online_orders
  WHERE id = NEW.order_id
  FOR KEY SHARE;

  IF NOT FOUND OR v_order.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Pedido não encontrado para este estabelecimento.';
  END IF;

  IF v_order.status <> 'completed' OR v_order.completed_at IS NULL THEN
    RAISE EXCEPTION 'Somente pedidos concluídos podem receber avaliação.';
  END IF;

  NEW.customer_name_snapshot := left(btrim(v_order.customer_name), 120);
  NEW.is_verified_purchase := true;
  IF TG_OP = 'INSERT' THEN
    NEW.updated_at := NEW.submitted_at;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_establishment_review_order()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_establishment_review_order() IS
  'Valida compra concluida e impede edicao posterior da nota e do comentario.';

COMMIT;