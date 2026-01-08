-- Performance indexes for high-traffic queries.
-- Run in psql with: \i performance_indexes.sql
-- These use CREATE INDEX CONCURRENTLY to avoid long locks; run one by one in maintenance windows if possible.
-- Requires PostgreSQL 9.5+ for IF NOT EXISTS.

-- Masterlist: date scoping + cancel filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_cafi_cancel ON masterlist (cafi_date, cancel_time);

-- Masterlist: date + cancel + PK
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_cafi_no ON masterlist (cafi_date, cancel_time, no);

-- Masterlist: seq lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_seq ON masterlist (seq);

-- Masterlist: seq + date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_seq_cafi ON masterlist (seq, cafi_date);

-- Masterlist: fitment/chassis filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_fitment_chassis ON masterlist (fitment_id, chassis);

-- Masterlist: model text filter (btree for prefix / ILIKE with leading % still uses seq scan; consider trigram if needed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_model_description ON masterlist (model_description);

-- Checkin: joins on masterlist_id + type, date filtering, status, bay
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkin_master_type_time ON checkin (masterlist_id, type, checkin_time);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkin_status ON checkin (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkin_bay ON checkin (bay_id);

-- Checkin: status + join keys (for status filters)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkin_status_master_type ON checkin (status, masterlist_id, type);

-- Checkin: time + join keys (when date_field=checkin)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkin_time_master_type ON checkin (checkin_time, masterlist_id, type);

-- Checkin: standby history filters by accessories::date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkin_accessories_date ON checkin ((accessories::date));

-- Task item: joins on masterlist/type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_item_master_type ON task_item (masterlist_id, type);

-- Optional: if task_item.type is frequently filtered alone
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_item_type ON task_item (type);

-- Trigram indexes for ILIKE with leading % (requires pg_trgm extension)
-- Uncomment the CREATE EXTENSION line if not already enabled.
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_chassis_trgm ON masterlist USING gin (chassis gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_fitment_trgm ON masterlist USING gin (fitment_id gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_masterlist_model_desc_trgm ON masterlist USING gin (model_description gin_trgm_ops);
