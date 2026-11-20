BEGIN;

-- Usernames and phone numbers become unique sign-in identifiers, as email addresses already are.

-- National form of a phone number, so 0772 123456 and +256772123456 compare equal. NULL when there
-- is no usable number. Must match users.NormalizePhone in Go.
CREATE FUNCTION normalize_phone(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE
        WHEN length(digits) < 9 THEN NULL
        WHEN digits ~ '^256[0-9]{9}$' THEN '0' || substr(digits, 4)
        ELSE digits
    END
    FROM regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') AS digits
$$;

-- The values a duplicate account had before it was renamed or cleared, so an admin can restore them.
ALTER TABLE users
    ADD COLUMN previous_username varchar(255),
    ADD COLUMN previous_phone_number varchar(15);

-- The oldest account keeps a shared identifier: by creation time, then legacy id.
WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY lower(btrim(username))
        ORDER BY created_at NULLS LAST, CASE WHEN legacy_id ~ '^[0-9]+$' THEN legacy_id::numeric END NULLS LAST, id) AS position
    FROM users)
UPDATE users u SET previous_username = u.username,
    username = u.username || '-' || coalesce(u.legacy_id, left(u.id::text, 8))
FROM ranked WHERE ranked.id = u.id AND ranked.position > 1;

WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY normalize_phone(phone_number)
        ORDER BY created_at NULLS LAST, CASE WHEN legacy_id ~ '^[0-9]+$' THEN legacy_id::numeric END NULLS LAST, id) AS position
    FROM users WHERE normalize_phone(phone_number) IS NOT NULL)
UPDATE users u SET previous_phone_number = u.phone_number, phone_number = ''
FROM ranked WHERE ranked.id = u.id AND ranked.position > 1;

CREATE UNIQUE INDEX users_username_unique ON users (lower(btrim(username)));
CREATE UNIQUE INDEX users_phone_unique ON users (normalize_phone(phone_number))
    WHERE normalize_phone(phone_number) IS NOT NULL;

-- The legacy backup can still be imported after migrations: an imported row whose username or phone
-- number is already taken is resolved the same way. Accounts created through the API carry no
-- legacy id and get a conflict error instead.
CREATE FUNCTION resolve_legacy_identifier_conflicts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT FROM public.users WHERE lower(btrim(username)) = lower(btrim(NEW.username))) THEN
        NEW.previous_username := NEW.username;
        NEW.username := NEW.username || '-' || NEW.legacy_id;
    END IF;
    IF public.normalize_phone(NEW.phone_number) IS NOT NULL AND EXISTS (
        SELECT FROM public.users WHERE public.normalize_phone(phone_number) = public.normalize_phone(NEW.phone_number)) THEN
        NEW.previous_phone_number := NEW.phone_number;
        NEW.phone_number := '';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER users_resolve_legacy_identifiers BEFORE INSERT ON users
FOR EACH ROW WHEN (NEW.legacy_id IS NOT NULL) EXECUTE FUNCTION resolve_legacy_identifier_conflicts();

COMMIT;
