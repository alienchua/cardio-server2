BEGIN;

CREATE TABLE IF NOT EXISTS ca_case (
  id BIGSERIAL PRIMARY KEY,
  fitment_id VARCHAR(100),
  chassis VARCHAR(100),
  model_description VARCHAR(200),
  masterlist_id BIGINT REFERENCES masterlist(no),
  work_type VARCHAR(20) CHECK (work_type IN ('FITMENT', 'HOIST')),
  created_by BIGINT NOT NULL REFERENCES admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  legacy_masterlist_id BIGINT UNIQUE,
  CHECK (NULLIF(BTRIM(fitment_id), '') IS NOT NULL OR NULLIF(BTRIM(chassis), '') IS NOT NULL)
);
ALTER TABLE ca_case ADD COLUMN IF NOT EXISTS masterlist_id BIGINT REFERENCES masterlist(no);
ALTER TABLE ca_case ADD COLUMN IF NOT EXISTS work_type VARCHAR(20);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'ca_case'::regclass AND conname = 'ca_case_work_type_check') THEN
    ALTER TABLE ca_case ADD CONSTRAINT ca_case_work_type_check CHECK (work_type IN ('FITMENT', 'HOIST'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ca_case_masterlist ON ca_case(masterlist_id);

CREATE TABLE IF NOT EXISTS ca_line_check (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES ca_case(id),
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  result VARCHAR(20) NOT NULL CHECK (result IN ('APPROVED', 'DEFECT', 'INFO')),
  checked_by_name VARCHAR(150) NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL,
  general_remark TEXT,
  correction_reason TEXT,
  recorded_by BIGINT NOT NULL REFERENCES admins(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, attempt_no)
);

-- Move any records from the earlier masterlist-linked version into manual CA cases.
ALTER TABLE ca_line_check ADD COLUMN IF NOT EXISTS case_id BIGINT REFERENCES ca_case(id);
ALTER TABLE ca_line_check ADD COLUMN IF NOT EXISTS correction_reason TEXT;
ALTER TABLE ca_line_check DROP CONSTRAINT IF EXISTS ca_line_check_result_check;
ALTER TABLE ca_line_check ADD CONSTRAINT ca_line_check_result_check CHECK (result IN ('APPROVED', 'DEFECT', 'INFO'));
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'ca_line_check' AND column_name = 'masterlist_id'
  ) THEN
    EXECUTE $migration$
      INSERT INTO ca_case (fitment_id, chassis, model_description, masterlist_id, created_by, created_at, legacy_masterlist_id)
      SELECT COALESCE(NULLIF(BTRIM(m.fitment_id), ''),
        CASE WHEN NULLIF(BTRIM(m.chassis), '') IS NULL THEN 'Legacy CA-' || c.masterlist_id ELSE NULL END),
        NULLIF(BTRIM(m.chassis), ''),
        NULLIF(BTRIM(m.model_description), ''), c.masterlist_id, MIN(c.recorded_by), MIN(c.recorded_at), c.masterlist_id
      FROM ca_line_check c JOIN masterlist m ON m.no = c.masterlist_id
      GROUP BY c.masterlist_id, m.fitment_id, m.chassis, m.model_description
      ON CONFLICT (legacy_masterlist_id) DO NOTHING
    $migration$;
    EXECUTE 'UPDATE ca_line_check c SET case_id = x.id FROM ca_case x WHERE c.masterlist_id = x.legacy_masterlist_id';
    EXECUTE 'ALTER TABLE ca_line_check DROP COLUMN masterlist_id';
  END IF;
END $$;
ALTER TABLE ca_case DROP COLUMN IF EXISTS legacy_masterlist_id;
ALTER TABLE ca_line_check ALTER COLUMN case_id SET NOT NULL;
DROP INDEX IF EXISTS idx_ca_line_check_vehicle;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ca_line_check_case_attempt ON ca_line_check(case_id, attempt_no);
CREATE INDEX IF NOT EXISTS idx_ca_line_check_checked_at ON ca_line_check(checked_at DESC);

-- Remove the earlier CA-to-QG association. CA checks themselves remain intact.
DROP TABLE IF EXISTS ca_line_check_source;

CREATE TABLE IF NOT EXISTS ca_line_check_defect (
  id BIGSERIAL PRIMARY KEY,
  line_check_id BIGINT NOT NULL REFERENCES ca_line_check(id),
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  issue_name VARCHAR(150),
  description_name VARCHAR(150),
  area_name VARCHAR(150),
  remark TEXT,
  approved_at TIMESTAMPTZ,
  approved_by BIGINT REFERENCES admins(id),
  UNIQUE (line_check_id, sequence_no)
);
ALTER TABLE ca_line_check_defect ALTER COLUMN issue_name DROP NOT NULL;
ALTER TABLE ca_line_check_defect ALTER COLUMN description_name DROP NOT NULL;
ALTER TABLE ca_line_check_defect ALTER COLUMN area_name DROP NOT NULL;
ALTER TABLE ca_line_check_defect ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE ca_line_check_defect ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES admins(id);

CREATE TABLE IF NOT EXISTS ca_line_check_photo (
  id BIGSERIAL PRIMARY KEY,
  defect_id BIGINT NOT NULL REFERENCES ca_line_check_defect(id),
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TABLE IF EXISTS ca_defect_option;

COMMIT;
