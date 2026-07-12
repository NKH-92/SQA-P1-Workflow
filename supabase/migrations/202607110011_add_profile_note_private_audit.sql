-- Complete the authoritative private mutation trail for profile notes.
-- Public activity_logs remains UX telemetry; this trigger records the committed
-- row mutation in the same transaction as the profile_notes write.

do $$
begin
  if to_regprocedure('private.record_mutation_audit()') is null then
    raise exception 'private.record_mutation_audit() must exist before profile note audit is enabled';
  end if;
end $$;

drop trigger if exists profile_notes_private_audit on public.profile_notes;
create trigger profile_notes_private_audit
after insert or update or delete on public.profile_notes
for each row execute function private.record_mutation_audit('profile_note');
