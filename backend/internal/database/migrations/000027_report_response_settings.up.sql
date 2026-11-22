-- Response settings (reporting requirements v0.2, RF07, RN11): the review cycle, receipt deadline and
-- on-time target used by notification reports, saved per organisation with who set them, why and from
-- when. Rows are never changed: a new row takes effect from its date, so earlier reports stay
-- reproducible. A store's own row wins over the national row; without either the draft defaults apply.
BEGIN;

CREATE TABLE report_response_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NULL is the national setting; otherwise the store (district store or warehouse) it covers.
    store_id uuid REFERENCES stores(id),
    review_cycle varchar(12) NOT NULL CHECK (review_cycle IN ('weekly', 'monthly', 'bimonthly', 'quarterly')),
    deadline_days integer NOT NULL CHECK (deadline_days BETWEEN 1 AND 365),
    target_percent integer NOT NULL CHECK (target_percent BETWEEN 1 AND 100),
    effective_from date NOT NULL,
    set_by_id uuid NOT NULL REFERENCES users(id),
    reason text NOT NULL CHECK (reason <> '' AND length(reason) <= 1000),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX report_response_settings_scope_idx
    ON report_response_settings (store_id, effective_from DESC, created_at DESC);

INSERT INTO permissions (name, description) VALUES
    ('reports:configure', 'Set the review cycle, receipt deadline and on-time target for the assigned store; with orders:all_stores, nationally');

INSERT INTO role_permission (role_id, permission_id)
SELECT roles.id, permissions.id FROM roles CROSS JOIN permissions
WHERE roles.name = 'admin' AND permissions.name = 'reports:configure';

COMMIT;
