BEGIN;

-- Venue types such as "Guest house" were cut to 8 characters by the legacy column.
ALTER TABLE hot_spots
    ALTER COLUMN type TYPE varchar(40),
    ADD COLUMN rejection_reason text,
    DROP CONSTRAINT hot_spot_activation_state,
    ADD CONSTRAINT hot_spot_activation_state CHECK (submitted_by_id IS NULL
        OR (district_id IS NOT NULL AND status IN ('submitted', 'verified', 'active', 'rejected')
            AND (status = 'rejected') = (rejection_reason IS NOT NULL)));

-- Activation and rejection notify the submitting VHT.
ALTER TABLE hot_spot_events ADD COLUMN notify_user_id uuid REFERENCES users(id);

CREATE INDEX hot_spot_events_user_idx ON hot_spot_events (notify_user_id, created_at DESC, id DESC)
    WHERE notify_user_id IS NOT NULL;

COMMIT;
