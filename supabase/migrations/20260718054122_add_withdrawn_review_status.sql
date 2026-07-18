-- Stage A, part 1: enum values must be committed before later migrations use them.
alter type public.review_status add value if not exists 'withdrawn';

comment on type public.review_status is
  'Review lifecycle. withdrawn preserves requester history without showing the row in normal queues.';
