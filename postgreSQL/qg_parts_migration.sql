BEGIN;
ALTER TABLE qg_defect_option DROP CONSTRAINT IF EXISTS qg_defect_option_category_check;
ALTER TABLE qg_defect_option ADD CONSTRAINT qg_defect_option_category_check CHECK (category IN ('description', 'area', 'oe'));

ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS parts_type VARCHAR(20) CHECK (parts_type IN ('OE', 'ACCESSORIES'));
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS oe_id BIGINT REFERENCES qg_defect_option(id);
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS accessory_id BIGINT;
ALTER TABLE qg_inspection_defect ADD COLUMN IF NOT EXISTS part_name TEXT;

COMMIT;
