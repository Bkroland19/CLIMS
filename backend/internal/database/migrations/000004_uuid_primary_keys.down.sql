-- UUIDs can have been issued to clients and used to create new records.
-- Restore a pre-migration database backup to return to the numeric schema.
DO $$
BEGIN
    RAISE EXCEPTION 'UUID primary key migration cannot be reversed in place';
END;
$$;
