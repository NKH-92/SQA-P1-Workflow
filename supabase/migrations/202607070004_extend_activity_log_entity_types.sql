-- Extend activity_logs.entity_type to match application ActivityEntityType.
-- This migration preserves existing data and only replaces the check constraint.

alter table public.activity_logs
drop constraint if exists activity_logs_entity_type_check;

alter table public.activity_logs
add constraint activity_logs_entity_type_check
check (
  entity_type in (
    'review_request',
    'review_feedback',
    'project',
    'project_assignment',
    'product_assignment',
    'duty_assignment',
    'allowed_user',
    'profile_note',
    'product',
    'duty',
    'duty_major_category'
  )
);
