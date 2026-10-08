BEGIN;

-- QG authorization checks admin account status before serving requests.
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS qg_job (
  id BIGSERIAL PRIMARY KEY,
  masterlist_id BIGINT NOT NULL REFERENCES masterlist(no),
  task_type VARCHAR(20) NOT NULL CHECK (task_type IN ('FITMENT', 'HOIST')),
  source_checkin_id BIGINT NOT NULL REFERENCES checkin(no),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DEFECT', 'APPROVED', 'VOID')),
  available_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  latest_inspection_id BIGINT,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (masterlist_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_qg_job_status_available
  ON qg_job(status, available_at DESC);
CREATE INDEX IF NOT EXISTS idx_qg_job_masterlist
  ON qg_job(masterlist_id);

CREATE TABLE IF NOT EXISTS qg_inspection (
  id BIGSERIAL PRIMARY KEY,
  qg_job_id BIGINT NOT NULL REFERENCES qg_job(id),
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  result VARCHAR(20) NOT NULL CHECK (result IN ('APPROVED', 'DEFECT')),
  inspected_by BIGINT NOT NULL REFERENCES admins(id),
  inspected_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  device_scan_value VARCHAR(100),
  idempotency_key VARCHAR(100),
  general_remark TEXT,
  voided_at TIMESTAMP WITHOUT TIME ZONE,
  voided_by BIGINT REFERENCES admins(id),
  void_reason TEXT,
  UNIQUE (qg_job_id, attempt_no),
  UNIQUE (inspected_by, idempotency_key)
);

-- Preserve UTC storage even when the database session uses Malaysia time.
ALTER TABLE qg_inspection ALTER COLUMN inspected_at
  SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE INDEX IF NOT EXISTS idx_qg_inspection_inspected_at
  ON qg_inspection(inspected_at DESC);
CREATE INDEX IF NOT EXISTS idx_qg_inspection_user_date
  ON qg_inspection(inspected_by, inspected_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qg_job_latest_inspection_fkey'
  ) THEN
    ALTER TABLE qg_job
      ADD CONSTRAINT qg_job_latest_inspection_fkey
      FOREIGN KEY (latest_inspection_id) REFERENCES qg_inspection(id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS qg_defect_issue (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  task_type VARCHAR(20) NOT NULL DEFAULT 'ALL'
    CHECK (task_type IN ('FITMENT', 'HOIST', 'ALL')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qg_defect_option (
  id BIGSERIAL PRIMARY KEY,
  category VARCHAR(20) NOT NULL CHECK (category IN ('description', 'area')),
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE qg_defect_option DROP CONSTRAINT IF EXISTS qg_defect_option_category_check;
ALTER TABLE qg_defect_option ADD CONSTRAINT qg_defect_option_category_check CHECK (category IN ('description', 'area', 'oe'));

CREATE TABLE IF NOT EXISTS qg_inspection_defect (
  id BIGSERIAL PRIMARY KEY,
  inspection_id BIGINT NOT NULL REFERENCES qg_inspection(id),
  issue_id BIGINT NOT NULL REFERENCES qg_defect_issue(id),
  remark TEXT,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  approved_at TIMESTAMPTZ,
  approved_by BIGINT REFERENCES admins(id),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES admins(id);

ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS description_id BIGINT REFERENCES qg_defect_option(id);
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS area_id BIGINT REFERENCES qg_defect_option(id);
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS issue_name VARCHAR(150);
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS description_name VARCHAR(150);
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS area_name VARCHAR(150);

ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS parts_type VARCHAR(20) CHECK (parts_type IN ('OE', 'ACCESSORIES'));
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS oe_id BIGINT REFERENCES qg_defect_option(id);
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS accessory_id BIGINT;
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS part_name TEXT;

CREATE INDEX IF NOT EXISTS idx_qg_defect_inspection
  ON qg_inspection_defect(inspection_id, sequence_no);

CREATE TABLE IF NOT EXISTS qg_defect_photo (
  id BIGSERIAL PRIMARY KEY,
  defect_id BIGINT NOT NULL REFERENCES qg_inspection_defect(id),
  storage_key TEXT NOT NULL,
  url TEXT,
  file_name TEXT,
  content_type VARCHAR(100),
  file_size BIGINT,
  is_prototype BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at TIMESTAMP WITHOUT TIME ZONE,
  uploaded_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qg_photo_defect
  ON qg_defect_photo(defect_id);

INSERT INTO qg_defect_issue (code, name, task_type, sort_order)
VALUES
  ('FUNCTIONAL', 'Functional', 'ALL', 10),
  ('INSTALLATION', 'Installation', 'ALL', 20),
  ('HANDLING', 'Handling', 'ALL', 30),
  ('PART_MFG', 'Part/Mfg', 'ALL', 40),
  ('SPEC', 'Spec', 'ALL', 50)
ON CONFLICT (code) DO NOTHING;

INSERT INTO qg_defect_option (category, name, sort_order)
SELECT 'description', name, position FROM unnest(ARRAY[
  'HEAD LINING WRINKLE', 'GAPPING', 'LEVELNESS N.G', 'NOT FITTED PROPERLY',
  'POOR FITTED', 'DVR TAPE BUBBLE', 'DVR TAPE BRACKET OVER PRIMER',
  'DVR TAPE PRESS MARK', 'DVR TAPE WHITE LINE MARK', 'DVR TAPE MAPPING',
  'SCRATCH MARK', 'MULFUNCTION', 'DENT', 'OFF POSITION', 'WRONG POSITION',
  'COMING OFF', 'NIL', 'PAINT CHIP OFF', 'AUDIO BACK COVER (SC / GAP)',
  'NOT FUNCTION', 'DIRTY', 'EXTRA PART', 'NOT STICKY', 'A PILLER LHS BULGING',
  'STAIN', 'NOT FULLY TIGHTEN', 'NOT FULLY INSERT', 'TUCK IN', 'SHAKY',
  'MISSING PART', 'VIEW PVM ABNORMAL', 'ENGINE INDICATOR ABNORMAL',
  'OVER PRIMER', 'DVR SLANTING', 'SCREW SLANTING'
]) WITH ORDINALITY AS defaults(name, position)
WHERE NOT EXISTS (SELECT 1 FROM qg_defect_option WHERE category = 'description');

INSERT INTO qg_defect_option (category, name, sort_order)
SELECT 'area', 'None', 1
WHERE NOT EXISTS (SELECT 1 FROM qg_defect_option WHERE category = 'area');

COMMIT;
