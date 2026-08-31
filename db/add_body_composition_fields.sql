-- Backs the new "Body Composition (estimate)" metric, which is deliberately
-- SEPARATE from BMI (BMI stays pure height+weight — see src/lib/bmi.js).
-- This one estimates body fat % from the Relative Fat Mass formula (height +
-- waist + sex), then uses age to pick which healthy-range category applies
-- (see src/lib/bodyComposition.js) — age changes what counts as "healthy"
-- for a given %, it doesn't change the % itself; no formula uses age as a
-- numeric input the way height/weight/waist are used.
alter table profiles add column if not exists age int;
alter table profiles add column if not exists sex text check (sex in ('male','female'));
