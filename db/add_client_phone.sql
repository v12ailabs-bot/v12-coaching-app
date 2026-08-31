-- Lets the coach put a client's phone number on file so the mobile Client
-- Profile's "Call" action has something real to dial (tel: link) instead of
-- being a dead button — no phone field existed anywhere in the schema before.
alter table profiles add column if not exists phone text;
