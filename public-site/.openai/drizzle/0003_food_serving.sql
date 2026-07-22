ALTER TABLE foods ADD COLUMN serving_g REAL;
ALTER TABLE foods ADD COLUMN serving_label TEXT DEFAULT '1 份';
ALTER TABLE foods ADD COLUMN serving_source TEXT;
