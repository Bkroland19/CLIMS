BEGIN;

LOCK TABLE notifications, notification_recipients IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT FROM notifications) THEN
        RAISE EXCEPTION 'Export and clear notifications before rolling back';
    END IF;
END;
$$;

DROP TABLE notification_recipients, notifications;

-- Restore the unused legacy Laravel table as migrations 1 and 4 left it.
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type varchar(255) NOT NULL,
    notifiable_type varchar(255) NOT NULL,
    notifiable_id bigint NOT NULL,
    data text NOT NULL,
    read_at timestamp,
    created_at timestamp,
    updated_at timestamp
);
CREATE INDEX notifications_notifiable_type_notifiable_id_index ON notifications (notifiable_type, notifiable_id);

COMMIT;
