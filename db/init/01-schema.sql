-- Vacation management schema. Runs once, on first start of an empty postgres volume
-- (docker-entrypoint-initdb.d). Reset with: docker compose down -v

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('Requester', 'Validator');
CREATE TYPE vacation_status AS ENUM ('Pending', 'Approved', 'Rejected');

CREATE TABLE users (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(255) NOT NULL,
    email       varchar(255) NOT NULL,
    password    varchar(255) NOT NULL,            -- bcrypt/argon2 hash, never plain text
    role        user_role    NOT NULL DEFAULT 'Requester',
    created_at  timestamptz  NOT NULL DEFAULT now()
);
-- Case-insensitive unique login.
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE vacation_requests (
    id          uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid            NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    start_date  date            NOT NULL,
    end_date    date            NOT NULL,
    reason      text,
    status      vacation_status NOT NULL DEFAULT 'Pending',
    comments    text,                              -- validator comment; mandatory on rejection
    expired_at  timestamptz,                       -- set once when a request is still Pending after its start date
    created_at  timestamptz     NOT NULL DEFAULT now(),
    updated_at  timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT vacation_dates_ck CHECK (end_date > start_date),
    CONSTRAINT vacation_rejection_comment_ck
        CHECK (status <> 'Rejected' OR length(btrim(coalesce(comments, ''))) > 0),
    -- A user cannot have two overlapping active (non-rejected) requests.
    CONSTRAINT vacation_no_overlap_xc
        EXCLUDE USING gist (user_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
        WHERE (status <> 'Rejected')
);

-- Requester view (own requests, newest first) and validator filters/pagination.
CREATE INDEX vacation_requests_user_created_idx   ON vacation_requests (user_id, created_at DESC);
CREATE INDEX vacation_requests_status_created_idx ON vacation_requests (status, created_at DESC);
-- Expiry job: only the few overdue, not-yet-expired pending requests.
CREATE INDEX vacation_requests_expirable_idx      ON vacation_requests (start_date)
    WHERE status = 'Pending' AND expired_at IS NULL;
-- Team vacation planning: range lookups on dates.
CREATE INDEX vacation_requests_dates_idx          ON vacation_requests (start_date, end_date);

-- Keep updated_at fresh and freeze approved requests at the DB level.
CREATE FUNCTION vacation_requests_before_update() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'Approved' THEN
        RAISE EXCEPTION 'Approved vacation requests cannot be modified' USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER vacation_requests_before_update
    BEFORE UPDATE ON vacation_requests
    FOR EACH ROW EXECUTE FUNCTION vacation_requests_before_update();
