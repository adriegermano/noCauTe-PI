-- Rode no SQL Editor depois de criar a conta e confirmar o e-mail.
-- Troque o endereço de exemplo; não promova alguém por engano, né.
update public.profiles as profile
set role = 'instrutor',
    status = 'ativo'
from auth.users as auth_user
where profile.id = auth_user.id
  and lower(auth_user.email) = lower('instrutor@exemplo.com')
returning profile.id, auth_user.email, profile.role, profile.status;
