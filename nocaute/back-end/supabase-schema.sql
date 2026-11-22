-- Schema inicial do noCauTe para um projeto Supabase novo.
-- Rode uma vez no SQL Editor como postgres; rodar de novo sem limpar pode dar ruim.

begin;

-- As etiquetas que impedem cada campo de virar uma salada de valores.
create type public.user_role as enum ('aluno', 'instrutor', 'admin');
create type public.account_status as enum ('ativo', 'inativo', 'bloqueado');
create type public.class_status as enum ('agendada', 'cancelada', 'concluida');
create type public.reservation_status as enum ('reservada', 'cancelada');
create type public.attendance_status as enum ('presente', 'falta', 'justificada');
create type public.membership_status as enum ('pendente', 'ativa', 'cancelada', 'expirada');
create type public.payment_status as enum ('pendente', 'pago', 'atrasado', 'cancelado', 'estornado');
create type public.payment_method as enum ('pix', 'cartao', 'dinheiro', 'transferencia', 'outro');

-- Carimba a data da última mudança, sem depender da memória de ninguém.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Cadastro de cada pessoa; o Auth guarda a conta e esta tabela guarda o perfil.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  role public.user_role not null default 'aluno',
  status public.account_status not null default 'ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 160),
  constraint profiles_phone_length check (phone is null or char_length(phone) <= 32)
);

-- Conta nova no Auth ganha perfil junto; sem isso, o login fica órfão.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Modalidades, planos e aulas: o catálogo que o site mostra.
create table public.modalities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modalities_name_length check (char_length(name) between 1 and 80)
);

-- Planos com preço e benefícios; preço negativo não é promoção, é bug.
create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  price numeric(10, 2) not null check (price >= 0),
  billing_interval text not null default 'mensal'
    check (billing_interval in ('mensal', 'anual', 'unico')),
  benefits jsonb not null default '[]'::jsonb
    check (jsonb_typeof(benefits) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_plans_name_length check (char_length(name) between 1 and 80)
);

-- Aulas que pertencem a uma modalidade.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  modality_id uuid not null references public.modalities (id) on delete restrict,
  name text not null,
  level text not null default 'Todos os níveis',
  duration_minutes smallint not null check (duration_minutes between 1 and 360),
  location text not null default '',
  capacity integer not null check (capacity > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_name_length check (char_length(name) between 1 and 120),
  constraint classes_unique_name_per_modality unique (modality_id, name)
);

-- Horários recorrentes da aula e quem vai dar o treino.
create table public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  instructor_id uuid references public.profiles (id) on delete set null,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  effective_from date not null default current_date,
  effective_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedules_valid_period
    check (effective_until is null or effective_until >= effective_from),
  constraint class_schedules_unique_start
    unique (class_id, weekday, starts_at, effective_from)
);

-- Encontros com data e hora de verdade, com ou sem horário fixo.
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  schedule_id uuid references public.class_schedules (id) on delete set null,
  instructor_id uuid references public.profiles (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '',
  capacity integer not null check (capacity > 0),
  status public.class_status not null default 'agendada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_sessions_valid_period check (ends_at > starts_at)
);

-- Plano contratado por aluno e preço combinado naquele momento.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete restrict,
  plan_id uuid not null references public.membership_plans (id) on delete restrict,
  status public.membership_status not null default 'pendente',
  starts_on date not null default current_date,
  ends_on date,
  price_at_purchase numeric(10, 2) not null check (price_at_purchase >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memberships_valid_period check (ends_on is null or ends_on >= starts_on)
);

create unique index memberships_one_active_per_student
  on public.memberships (student_id)
  where status = 'ativa';

-- Reservas seguram vaga; a regra abaixo não deixa lotar além da capacidade.
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  status public.reservation_status not null default 'reservada',
  reserved_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_unique_student_session unique (session_id, student_id),
  constraint reservations_cancelled_at check (
    (status = 'cancelada' and cancelled_at is not null)
    or (status = 'reservada' and cancelled_at is null)
  )
);

-- Antes de aceitar reserva, confere se a aula existe, está no futuro e cabe gente.
create or replace function public.prepare_reservation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  session_record public.class_sessions%rowtype;
  reservation_count integer;
begin
  if new.status = 'cancelada' then
    new.cancelled_at = coalesce(new.cancelled_at, now());
    return new;
  end if;

  new.cancelled_at = null;
  if tg_op = 'UPDATE' and old.status = 'reservada' then
    return new;
  end if;

  select *
    into session_record
    from public.class_sessions
    where id = new.session_id
    for update;

  if not found or session_record.status <> 'agendada'
      or session_record.starts_at <= now() then
    raise exception 'Esta aula não está disponível para reserva.'
      using errcode = '23514';
  end if;

  select count(*)::integer
    into reservation_count
    from public.reservations
    where session_id = new.session_id
      and status = 'reservada';

  if reservation_count >= session_record.capacity then
    raise exception 'Não há vagas disponíveis nesta aula.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger reservations_prepare
  before insert or update of status on public.reservations
  for each row execute function public.prepare_reservation();

-- Presença e pagamento: cada aluno fica com o próprio histórico.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.class_sessions (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  marked_by uuid references public.profiles (id) on delete set null,
  status public.attendance_status not null,
  notes text,
  marked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_unique_student_session unique (session_id, student_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id) on delete restrict,
  student_id uuid not null references public.profiles (id) on delete restrict,
  amount numeric(10, 2) not null check (amount >= 0),
  due_on date not null,
  paid_at timestamptz,
  method public.payment_method,
  status public.payment_status not null default 'pendente',
  external_reference text unique,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_paid_at check (
    (status in ('pago', 'estornado') and paid_at is not null)
    or (status not in ('pago', 'estornado'))
  )
);

-- Atalhos para as consultas que o sistema faz toda hora.
create index class_sessions_starts_at_idx on public.class_sessions (starts_at);
create index class_sessions_class_id_idx on public.class_sessions (class_id);
create index class_schedules_instructor_id_idx on public.class_schedules (instructor_id);
create index memberships_student_status_idx on public.memberships (student_id, status);
create index reservations_student_status_idx on public.reservations (student_id, status);
create index attendance_student_marked_at_idx on public.attendance (student_id, marked_at desc);
create index payments_student_due_on_idx on public.payments (student_id, due_on desc);

-- Atualiza a data de mudança automaticamente; ninguém precisa lembrar disso.
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger modalities_set_updated_at before update on public.modalities
  for each row execute function public.set_updated_at();
create trigger membership_plans_set_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();
create trigger classes_set_updated_at before update on public.classes
  for each row execute function public.set_updated_at();
create trigger class_schedules_set_updated_at before update on public.class_schedules
  for each row execute function public.set_updated_at();
create trigger class_sessions_set_updated_at before update on public.class_sessions
  for each row execute function public.set_updated_at();
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations
  for each row execute function public.set_updated_at();
create trigger attendance_set_updated_at before update on public.attendance
  for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- Diz se a pessoa é instrutor ou admin ativo; o resto não ganha chave do salão.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('instrutor', 'admin')
      and p.status = 'ativo'
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

-- Liga as travas de acesso e define o que cada tipo de conta pode fazer.
alter table public.profiles enable row level security;
alter table public.modalities enable row level security;
alter table public.membership_plans enable row level security;
alter table public.classes enable row level security;
alter table public.class_schedules enable row level security;
alter table public.class_sessions enable row level security;
alter table public.memberships enable row level security;
alter table public.reservations enable row level security;
alter table public.attendance enable row level security;
alter table public.payments enable row level security;

grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select on public.modalities, public.membership_plans, public.classes,
  public.class_schedules, public.class_sessions to anon, authenticated;
grant select, insert, update, delete on public.modalities, public.membership_plans,
  public.classes, public.class_schedules, public.class_sessions to authenticated;
grant select, insert, update on public.memberships to authenticated;
grant select, insert on public.reservations to authenticated;
grant update (status, cancelled_at) on public.reservations to authenticated;
grant select, insert, update on public.attendance to authenticated;
grant select, insert, update on public.payments to authenticated;

-- Cada aluno vê o próprio perfil; equipe pode cuidar dos perfis necessários.
create policy profiles_select_self_or_staff on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy profiles_update_self_or_staff on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()))
  with check (id = (select auth.uid()) or (select public.is_staff()));

-- Catálogo público: todo mundo vê o que está ativo, equipe pode administrar.
create policy modalities_read_active on public.modalities
  for select to anon, authenticated
  using (active or (select public.is_staff()));
create policy modalities_staff_manage on public.modalities
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Mesma regra para planos: vitrine aberta, alterações só para equipe.
create policy membership_plans_read_active on public.membership_plans
  for select to anon, authenticated
  using (active or (select public.is_staff()));
create policy membership_plans_staff_manage on public.membership_plans
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Aulas e horários ativos aparecem para todos; equipe faz as mudanças.
create policy classes_read_active on public.classes
  for select to anon, authenticated
  using (active or (select public.is_staff()));
create policy classes_staff_manage on public.classes
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

create policy class_schedules_read_active on public.class_schedules
  for select to anon, authenticated
  using (active or (select public.is_staff()));
create policy class_schedules_staff_manage on public.class_schedules
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Aulas futuras aparecem; só a equipe mexe no calendário.
create policy class_sessions_read_upcoming_or_staff on public.class_sessions
  for select to anon, authenticated
  using ((status = 'agendada' and ends_at > now()) or (select public.is_staff()));
create policy class_sessions_staff_manage on public.class_sessions
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Matrículas ficam visíveis ao dono e à equipe.
create policy memberships_read_owner_or_staff on public.memberships
  for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));
create policy memberships_staff_manage on public.memberships
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Aluno vê e cancela a própria reserva; vaga alheia não é brinquedo.
create policy reservations_read_owner_or_staff on public.reservations
  for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));
create policy reservations_insert_owner on public.reservations
  for insert to authenticated
  with check (student_id = (select auth.uid()));
create policy reservations_update_owner_or_staff on public.reservations
  for update to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()))
  with check (
    (student_id = (select auth.uid()) and status = 'cancelada')
    or (select public.is_staff())
  );

create policy attendance_read_owner_or_staff on public.attendance
  for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));
create policy attendance_staff_manage on public.attendance
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Pagamentos também ficam restritos ao aluno dono e à equipe.
create policy payments_read_owner_or_staff on public.payments
  for select to authenticated
  using (student_id = (select auth.uid()) or (select public.is_staff()));
create policy payments_staff_manage on public.payments
  for all to authenticated
  using ((select public.is_staff()))
  with check ((select public.is_staff()));

-- Carga inicial para a tela não acordar vazia.
insert into public.modalities (name, description) values
  ('Boxe', 'Treinos de boxe para diferentes níveis.'),
  ('Muay Thai', 'Treinos de Muay Thai para diferentes níveis.'),
  ('Jiu-Jitsu', 'Aulas de Jiu-Jitsu.'),
  ('Kickboxing', 'Treinos de kickboxing para diferentes níveis.'),
  ('Funcional', 'Treino de força, resistência e condicionamento.')
on conflict (name) do nothing;

insert into public.membership_plans (name, description, price, benefits) values
  ('Iniciante', 'Plano mensal para início dos treinos.', 129.00,
    '["2x por semana", "1 modalidade", "Acesso ao Dashboard", "Avaliação Inicial"]'::jsonb),
  ('Competidor', 'Plano mensal com aulas livres e acompanhamento.', 189.00,
    '["Aulas livres", "Todas as modalidades", "Treino Funcional Incluso", "Acompanhamento de Frequência", "Sparring Supervisionado"]'::jsonb),
  ('Personal', 'Plano mensal com sessões individuais.', 349.00,
    '["8 Sessões Individuais", "Treino 1 a 1", "Plano de evolução", "Horário Flexível"]'::jsonb)
on conflict (name) do nothing;

-- Para promover um usuário a instrutor, troque o e-mail e execute como administrador
-- pelo SQL Editor (não exponha essa permissão no cadastro público):
-- update public.profiles p
-- set role = 'instrutor'
-- from auth.users u
-- where p.id = u.id and lower(u.email) = lower('instrutor@exemplo.com');

commit;
