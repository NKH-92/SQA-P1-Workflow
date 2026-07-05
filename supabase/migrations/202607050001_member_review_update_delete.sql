-- Allow requesters to update or withdraw their own pending review requests.

create policy "review_requests_update_self_pending"
on public.review_requests for update
to authenticated
using (requester_id = auth.uid() and status = 'pending')
with check (requester_id = auth.uid() and status = 'pending');

create policy "review_requests_delete_self_pending"
on public.review_requests for delete
to authenticated
using (requester_id = auth.uid() and status = 'pending');
