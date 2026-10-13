-- Program Only clients can't read roadmap phases. Derived from profiles.client_type
-- at read time: no rows are changed or deleted, so a client who returns to
-- coaching sees their roadmap exactly as it was. Idempotent.
drop policy if exists program_phases_select on program_phases;
create policy program_phases_select on program_phases for select using (
  public.is_coach()
  or (
    client_id = auth.uid()
    and coalesce((select p.show_roadmap_to_client from programs p where p.id = program_phases.program_id), true)
    and coalesce((select pr.client_type from profiles pr where pr.id = auth.uid()), '') <> 'program_only'
  )
);
