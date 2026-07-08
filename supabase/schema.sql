-- =============================================================
-- MADAME SOLOMI'NA · Схема базы данных Supabase
-- =============================================================
-- Запуск: Supabase Dashboard → SQL Editor → New query → вставить
-- ВЕСЬ файл целиком → Run. Скрипт идемпотентен — повторный запуск
-- ничего не ломает (drop/create политик и триггеров).
--
-- Три таблицы:
--   profiles   — профиль пользователя (роль, бан, активность)
--   user_data  — синхронизация данных приложения (портфели, настройки…)
--   app_events — журнал событий (регистрации, входы, действия админа)
--
-- Доступ построен на RLS: пользователь видит только своё,
-- администратор (profiles.role = 'admin') — всё.
-- =============================================================


-- ===== 1. ПРОФИЛИ ============================================

create table if not exists public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    email        text,
    name         text,
    role         text        not null default 'user' check (role in ('user', 'admin')),
    banned       boolean     not null default false,
    created_at   timestamptz not null default now(),
    last_seen_at timestamptz not null default now()
);

comment on table public.profiles is 'Профили пользователей: роль, бан, последняя активность';


-- ===== 2. ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ================================
-- Ключи localStorage приложения (portfolios_v1, profile_settings_v1…)
-- зеркалируются сюда модулем cloud-sync.js. Одна строка = один ключ.

create table if not exists public.user_data (
    user_id    uuid not null references public.profiles(id) on delete cascade,
    key        text not null,
    value      jsonb,
    updated_at timestamptz not null default now(),
    primary key (user_id, key)
);

comment on table public.user_data is 'Синхронизированные данные приложения, по строке на localStorage-ключ';


-- ===== 3. ЖУРНАЛ СОБЫТИЙ =====================================

create table if not exists public.app_events (
    id         bigint generated always as identity primary key,
    user_id    uuid references public.profiles(id) on delete set null,
    event      text not null,
    meta       jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists app_events_created_idx on public.app_events (created_at desc);
create index if not exists app_events_user_idx    on public.app_events (user_id, created_at desc);

comment on table public.app_events is 'Журнал: register / login / logout / password_reset / admin_*';


-- ===== 4. ХЕЛПЕРЫ ДЛЯ RLS ====================================
-- security definer обходит RLS самих profiles — иначе политика
-- «admin видит всё» зациклилась бы на чтении своей же таблицы.

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin' and not banned
    );
$$;

create or replace function public.is_banned()
returns boolean
language sql stable security definer
set search_path = public
as $$
    select coalesce(
        (select banned from public.profiles where id = auth.uid()),
        false
    );
$$;


-- ===== 5. ТРИГГЕРЫ ===========================================

-- 5.1 Новый пользователь в auth.users → профиль + событие «register»
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, name)
    values (
        new.id,
        new.email,
        coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;

    insert into public.app_events (user_id, event)
    values (new.id, 'register');

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 5.2 Смена email в auth.users (после подтверждения письмом) → зеркалим в профиль
create or replace function public.handle_user_email_updated()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
    update public.profiles set email = new.email where id = new.id;
    return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
    after update of email on auth.users
    for each row
    when (old.email is distinct from new.email)
    execute function public.handle_user_email_updated();

-- 5.3 Защита профиля:
--   · роль и бан меняет только админ,
--   · нельзя снять роль/забанить ПОСЛЕДНЕГО админа (сервис не осиротеет),
--   · created_at неизменяем.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
    if new.created_at is distinct from old.created_at then
        new.created_at := old.created_at;
    end if;

    if (new.role is distinct from old.role or new.banned is distinct from old.banned)
       and not public.is_admin() then
        raise exception 'Менять роль и блокировку может только администратор';
    end if;

    if old.role = 'admin' and (new.role <> 'admin' or new.banned) then
        if not exists (
            select 1 from public.profiles
            where role = 'admin' and not banned and id <> old.id
        ) then
            raise exception 'Нельзя снять или заблокировать последнего администратора';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
    before update on public.profiles
    for each row execute function public.guard_profile_update();

-- 5.4 user_data.updated_at обновляется сам при каждой записи
create or replace function public.touch_user_data()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists touch_user_data on public.user_data;
create trigger touch_user_data
    before insert or update on public.user_data
    for each row execute function public.touch_user_data();


-- ===== 6. ROW LEVEL SECURITY =================================

alter table public.profiles  enable row level security;
alter table public.user_data enable row level security;
alter table public.app_events enable row level security;

-- --- profiles ---
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
    for select to authenticated
    using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
    for update to authenticated
    using (id = auth.uid() or public.is_admin())
    with check (id = auth.uid() or public.is_admin());

-- страховка на случай, если триггер не создал профиль
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
    for insert to authenticated
    with check (id = auth.uid());

-- --- user_data ---
drop policy if exists user_data_select on public.user_data;
create policy user_data_select on public.user_data
    for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_data_insert on public.user_data;
create policy user_data_insert on public.user_data
    for insert to authenticated
    with check (user_id = auth.uid() and not public.is_banned());

drop policy if exists user_data_update on public.user_data;
create policy user_data_update on public.user_data
    for update to authenticated
    using (user_id = auth.uid() and not public.is_banned())
    with check (user_id = auth.uid() and not public.is_banned());

-- своё можно удалить самому, чужое — только админу («Очистить данные»)
drop policy if exists user_data_delete on public.user_data;
create policy user_data_delete on public.user_data
    for delete to authenticated
    using (user_id = auth.uid() or public.is_admin());

-- --- app_events ---
drop policy if exists app_events_select on public.app_events;
create policy app_events_select on public.app_events
    for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

drop policy if exists app_events_insert on public.app_events;
create policy app_events_insert on public.app_events
    for insert to authenticated
    with check (user_id = auth.uid() and not public.is_banned());


-- ===== 7. НАЗНАЧЕНИЕ ПЕРВОГО АДМИНИСТРАТОРА ==================
-- После того как зарегистрируетесь на сайте, выполните здесь же
-- (подставив свой email):
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Дальше роли раздаются прямо из админки сайта.
