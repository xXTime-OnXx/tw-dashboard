CREATE TABLE IF NOT EXISTS conquest_coverage(world text NOT NULL, object_key text PRIMARY KEY, queried_from timestamptz NOT NULL, queried_until timestamptz NOT NULL, event_count integer NOT NULL CHECK(event_count>=0));
CREATE INDEX IF NOT EXISTS conquest_coverage_world_queried_from_queried_until_idx ON conquest_coverage(world,queried_from,queried_until);
