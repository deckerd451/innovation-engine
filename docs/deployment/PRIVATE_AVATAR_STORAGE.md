# Private avatar storage rollout

`private-avatars` is a separate private bucket. Its Storage policies allow
signed reads for the owner, an authenticated Admin, or a member whose profile
has recorded photo consent. Owners alone can upload, replace, or delete.

The existing `hacksbucket` is shared by non-profile assets and remains public.
Do not change that bucket's public setting during this rollout.

The remaining migration is deliberately staged: copy each profile image to
`private-avatars/avatars/{community.user_id}/{filename}`, verify the object,
then store that path in `community.avatar_storage_path`. Update the frontend to
create short-lived signed URLs for that path before rendering. Only after all
references are verified should old profile copies be retired.
