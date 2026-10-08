BEGIN;
CREATE TABLE IF NOT EXISTS audit_inspection (
  id BIGSERIAL PRIMARY KEY,
  qg_job_id BIGINT NOT NULL REFERENCES qg_job(id),
  qg_inspection_id BIGINT REFERENCES qg_inspection(id),
  qg_result VARCHAR(20) CHECK (qg_result IN ('APPROVED', 'DEFECT')),
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  result VARCHAR(20) NOT NULL CHECK (result IN ('APPROVED', 'DEFECT')),
  audited_by BIGINT NOT NULL REFERENCES admins(id),
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  general_remark TEXT,
  idempotency_key VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  voided_at TIMESTAMPTZ,
  voided_by BIGINT REFERENCES admins(id),
  void_reason TEXT,
  UNIQUE (qg_job_id, attempt_no),
  UNIQUE (audited_by, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_audit_inspection_job ON audit_inspection(qg_job_id, id DESC) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_inspection_date ON audit_inspection(inspected_at DESC);
CREATE TABLE IF NOT EXISTS audit_inspection_defect (
  id BIGSERIAL PRIMARY KEY,
  inspection_id BIGINT NOT NULL REFERENCES audit_inspection(id),
  sequence_no INTEGER NOT NULL,
  issue_name VARCHAR(150) NOT NULL,
  description_name VARCHAR(150) NOT NULL,
  area_name VARCHAR(150) NOT NULL,
  parts_type VARCHAR(20) NOT NULL CHECK (parts_type IN ('OE','ACCESSORIES')),
  part_name TEXT NOT NULL,
  remark TEXT,
  UNIQUE (inspection_id, sequence_no)
);
CREATE TABLE IF NOT EXISTS audit_defect_photo (
  id BIGSERIAL PRIMARY KEY,
  defect_id BIGINT NOT NULL REFERENCES audit_inspection_defect(id),
  storage_key TEXT NOT NULL,
  file_name TEXT,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0)
);
CREATE INDEX IF NOT EXISTS idx_audit_photo_defect ON audit_defect_photo(defect_id);
COMMIT;
