BEGIN;

ALTER TABLE ca_line_check_defect ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE ca_line_check_defect ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES admins(id);

ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES admins(id);

COMMIT;
