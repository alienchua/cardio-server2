BEGIN;

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
  inspected_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  device_scan_value VARCHAR(100),
  idempotency_key VARCHAR(100),
  general_remark TEXT,
  voided_at TIMESTAMP WITHOUT TIME ZONE,
  voided_by BIGINT REFERENCES admins(id),
  void_reason TEXT,
  UNIQUE (qg_job_id, attempt_no),
  UNIQUE (inspected_by, idempotency_key)
);

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

CREATE TABLE IF NOT EXISTS qg_inspection_defect (
  id BIGSERIAL PRIMARY KEY,
  inspection_id BIGINT NOT NULL REFERENCES qg_inspection(id),
  issue_id BIGINT NOT NULL REFERENCES qg_defect_issue(id),
  remark TEXT,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
  ('LOOSE_INSTALLATION', 'Loose installation', 'ALL', 10),
  ('INCORRECT_ALIGNMENT', 'Incorrect alignment', 'ALL', 20),
  ('SCRATCH_DENT', 'Scratch or dent', 'ALL', 30),
  ('MISSING_ACCESSORY', 'Missing accessory', 'ALL', 40),
  ('WRONG_ACCESSORY', 'Wrong accessory installed', 'ALL', 50),
  ('ELECTRICAL_FAILURE', 'Electrical function not working', 'ALL', 60),
  ('NOISE_VIBRATION', 'Noise or vibration', 'ALL', 70),
  ('POOR_FINISHING', 'Dirty or poor finishing', 'ALL', 80),
  ('OTHER', 'Other', 'ALL', 90)
ON CONFLICT (code) DO NOTHING;

COMMIT;
