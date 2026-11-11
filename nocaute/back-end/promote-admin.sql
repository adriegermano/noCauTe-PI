-- Rode no SQL Editor como postgres, para uma conta já criada e confirmada.
-- Isso dá a chave de admin; use com cuidado, não é figurinha colecionável.
update public.profiles as profile
set role = 'admin',
    status = 'ativo'
from auth.users as auth_user
where profile.id = auth_user.id
  and lower(auth_user.email) = lower('miguelmarcos2412@gmail.com')
  and auth_user.email_confirmed_at is not null
returning profile.id, auth_user.email, profile.role, profile.status;
