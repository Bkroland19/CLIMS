-- Stores filled in by assign_user_stores() are kept: they cannot be told apart
-- from ones set by hand. Only NMS assignments are cleared, and NMS itself is
-- removed unless orders or stock already refer to it.
BEGIN;

DROP FUNCTION assign_user_stores();

UPDATE users SET store_id = NULL WHERE store_id = (SELECT id FROM stores WHERE code = 'nms');

DO $$
BEGIN
    DELETE FROM stores WHERE code = 'nms';
EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'National Medical Stores is in use and was kept';
END
$$;

COMMIT;
