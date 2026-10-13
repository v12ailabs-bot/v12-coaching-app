alter table foods add column if not exists household_measures text;
alter table meal_log_entries add column if not exists entered_quantity numeric(10,3);
alter table meal_log_entries add column if not exists entered_unit text;
