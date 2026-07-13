-- =============================================================
-- MADAME SOLOMI'NA · Схема базы данных Supabase
-- =============================================================
-- Запуск: Supabase Dashboard → SQL Editor → New query → вставить
-- ВЕСЬ файл целиком → Run. Скрипт идемпотентен — повторный запуск
-- ничего не ломает (drop/create политик и триггеров).
--
-- Таблицы:
--   profiles           — профиль пользователя (роль, бан, активность)
--   user_data          — синхронизация данных приложения (портфели, настройки…)
--   app_events         — журнал событий (регистрации, входы, действия админа)
--   notifications      — оповещения от админа (всем или адресно)
--   notification_reads — отметки «прочитано» по пользователям
--   app_config         — глобальные настройки (заглушки вкладок, баннеры)
--   feature_waitlist   — подписки «сообщить, когда раздел готов»
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

-- Роли (2026-07-11): user < admin < owner.
--   owner («владелец») — неприкосновенен: его нельзя разжаловать, забанить
--     или удалить через сайт; только он раздаёт и снимает роль админа;
--   admin — модерация обычных пользователей (бан, очистка, сброс пароля,
--     оповещения), но не трогает других админов и владельца.
-- Расширяем check-ограничение старых установок (имя создано автоматически).
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
    check (role in ('user', 'admin', 'owner'));

-- CREATE TABLE IF NOT EXISTS не трогает уже существующую таблицу —
-- добавляем новые колонки явно, чтобы обновления схемы попадали и на неё.
alter table public.profiles add column if not exists telegram_id bigint;
alter table public.profiles add column if not exists tg_photo_url text;

create unique index if not exists profiles_telegram_id_uidx
    on public.profiles (telegram_id) where telegram_id is not null;

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

-- is_admin() = «есть права модерации»: и админ, и владелец. Все политики
-- RLS ходят через неё, поэтому владельцу доступно всё админское.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role in ('admin', 'owner') and not banned
    );
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'owner' and not banned
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
    insert into public.profiles (id, email, name, telegram_id, tg_photo_url)
    values (
        new.id,
        new.email,
        coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
        nullif(new.raw_user_meta_data ->> 'telegram_id', '')::bigint,
        nullif(new.raw_user_meta_data ->> 'avatar_url', '')
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

-- 5.3 Защита профиля (иерархия ролей user < admin < owner):
--   · created_at неизменяем;
--   · владелец через сайт неприкосновенен: его роль и бан не меняет никто
--     (в т.ч. другой владелец) — только доверенный доступ (SQL Editor);
--   · назначает и снимает АДМИНОВ только владелец;
--   · банить/разбанивать админ может только обычных пользователей,
--     владелец — пользователей и админов;
--   · нельзя снять роль ПОСЛЕДНЕГО владельца/админа (сервис не осиротеет);
--   · telegram_id меняется ТОЛЬКО через link_telegram()/unlink_telegram()
--     (иначе любой пользователь мог бы вписать себе чужой telegram_id
--     и перехватывать чужие входы через Telegram).
create or replace function public.guard_profile_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
    if new.created_at is distinct from old.created_at then
        new.created_at := old.created_at;
    end if;

    -- auth.uid() пустой у прямых запросов (SQL Editor, service_role) — это доверенный
    -- доступ в обход сайта, его не ограничиваем (иначе некому назначить владельца).
    -- Обычный пользователь через сайт всегда авторизован, для него auth.uid() не пустой.
    if auth.uid() is not null
       and (new.role is distinct from old.role or new.banned is distinct from old.banned) then

        if not public.is_admin() then
            raise exception 'Менять роль и блокировку может только администратор';
        end if;

        -- владелец неприкосновенен (и сам себя через сайт не разжалует —
        -- передача владения только через SQL Editor, осознанно)
        if old.role = 'owner' then
            raise exception 'Владельца сервиса нельзя разжаловать или заблокировать';
        end if;

        -- назначение владельцем через сайт запрещено (только SQL Editor)
        if new.role = 'owner' then
            raise exception 'Назначить владельца можно только напрямую в базе данных';
        end if;

        -- роли admin ↔ user раздаёт только владелец
        if new.role is distinct from old.role and not public.is_owner() then
            raise exception 'Назначать и снимать администраторов может только владелец';
        end if;

        -- бан/разбан админа — только владельцу
        if old.role = 'admin' and new.banned is distinct from old.banned
           and not public.is_owner() then
            raise exception 'Блокировать администратора может только владелец';
        end if;
    end if;

    if auth.uid() is not null
       and new.telegram_id is distinct from old.telegram_id
       and coalesce(current_setting('app.telegram_link_verified', true), 'false') <> 'true'
       and not public.is_admin() then
        raise exception 'Telegram можно привязать только через проверенную привязку в личном кабинете';
    end if;

    -- сервис не должен осиротеть: последний владелец (или последний
    -- модератор вообще) не снимается и не блокируется даже из SQL Editor
    if old.role in ('admin', 'owner') and (new.role not in ('admin', 'owner') or new.banned) then
        if not exists (
            select 1 from public.profiles
            where role in ('admin', 'owner') and not banned and id <> old.id
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


-- ===== 7. ПРИВЯЗКА TELEGRAM К СУЩЕСТВУЮЩЕМУ АККАУНТУ =========
-- Используются из личного кабинета сайта (window.supa.linkTelegram/
-- unlinkTelegram), когда пользователь УЖЕ вошёл под email — привязывают
-- его подтверждённый Telegram-id к текущему аккаунту, дальше кнопка
-- «Войти через Telegram» заходит именно в него, а не заводит отдельный.
-- set_config('app.telegram_link_verified', 'true', true) — «пропуск»
-- для guard_profile_update() выше, действует только внутри этой функции.

-- старая однопараметровая версия мешала бы новой (двусмысленность вызова)
drop function if exists public.link_telegram(bigint);

create or replace function public.link_telegram(p_telegram_id bigint, p_photo_url text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Нужно быть авторизованным';
    end if;

    if exists (
        select 1 from public.profiles
        where telegram_id = p_telegram_id and id <> auth.uid()
    ) then
        raise exception 'Этот Telegram-аккаунт уже привязан к другому пользователю';
    end if;

    perform set_config('app.telegram_link_verified', 'true', true);
    update public.profiles
       set telegram_id  = p_telegram_id,
           tg_photo_url = coalesce(p_photo_url, tg_photo_url)
     where id = auth.uid();
    perform set_config('app.telegram_link_verified', 'false', true);
end;
$$;

grant execute on function public.link_telegram(bigint, text) to authenticated;

create or replace function public.unlink_telegram()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Нужно быть авторизованным';
    end if;

    perform set_config('app.telegram_link_verified', 'true', true);
    update public.profiles set telegram_id = null, tg_photo_url = null where id = auth.uid();
    perform set_config('app.telegram_link_verified', 'false', true);
end;
$$;

grant execute on function public.unlink_telegram() to authenticated;


-- ===== 8. УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ АДМИНОМ ======================
-- Вызывается из админки («Удалить аккаунт» в карточке пользователя).
-- security definer выполняется от владельца (postgres), поэтому может
-- удалить строку в auth.users — каскад стирает profiles и user_data,
-- в app_events user_id становится null («удалённый аккаунт»).

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'Удалять пользователей может только администратор';
    end if;

    if p_user_id = auth.uid() then
        raise exception 'Нельзя удалить собственный аккаунт';
    end if;

    -- владельца не удаляет никто; админа — только владелец, предварительно
    -- сняв роль (двухшаговость — защита от сноса модерации одним кликом)
    if exists (select 1 from public.profiles where id = p_user_id and role = 'owner') then
        raise exception 'Владельца сервиса удалить нельзя';
    end if;

    if exists (select 1 from public.profiles where id = p_user_id and role = 'admin') then
        raise exception 'Сначала снимите с пользователя роль администратора';
    end if;

    delete from auth.users where id = p_user_id;
end;
$$;

grant execute on function public.admin_delete_user(uuid) to authenticated;


-- ===== 8b. САМОУДАЛЕНИЕ АККАУНТА ==============================
-- Вызывается из личного кабинета («Удалить аккаунт» в разделе «Данные»).
-- Пользователь удаляет ТОЛЬКО себя (auth.uid()); каскад стирает его
-- profiles и user_data. Существующим установкам нужно выполнить этот
-- блок один раз (миграция), чтобы кнопка заработала.

create or replace function public.delete_own_account()
returns void
language plpgsql security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'Нужно войти в аккаунт';
    end if;

    -- владелец не удаляет себя из кабинета: сервис не должен остаться без
    -- хозяина случайным кликом. Передача владения — SQL Editor, осознанно.
    if exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
        raise exception 'Владелец не может удалить свой аккаунт — сначала передайте владение (SQL Editor)';
    end if;

    delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;


-- ===== 9. ОПОВЕЩЕНИЯ =========================================
-- Админ рассылает оповещения из админки: всем (user_id = null)
-- или конкретному пользователю. Пользователь видит их под
-- звоночком в шапке; отметки «прочитано» — в notification_reads
-- (строка на пару «пользователь × оповещение»), непрочитанные
-- считаются как разница. Существующим установкам достаточно
-- выполнить этот блок один раз (весь файл тоже безопасен).

create table if not exists public.notifications (
    id         bigint generated always as identity primary key,
    user_id    uuid references public.profiles(id) on delete cascade,   -- null = всем
    title      text not null,
    body       text not null default '',
    kind       text not null default 'info' check (kind in ('info', 'success', 'warn')),
    created_by uuid references public.profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx    on public.notifications (user_id, created_at desc);
create index if not exists notifications_created_idx on public.notifications (created_at desc);

comment on table public.notifications is 'Оповещения от администратора: user_id null — всем, иначе адресное';

create table if not exists public.notification_reads (
    user_id         uuid   not null references public.profiles(id) on delete cascade,
    notification_id bigint not null references public.notifications(id) on delete cascade,
    read_at         timestamptz not null default now(),
    primary key (user_id, notification_id)
);

comment on table public.notification_reads is 'Отметки «прочитано»: по строке на пользователя и оповещение';

-- Доставка в Telegram (worker /api/notify): пользователь включает сам
-- в настройках звоночка. Выключено по умолчанию — рассылка только по
-- явному согласию. Задел под push на телефон — там же, на клиенте.
alter table public.profiles add column if not exists notify_telegram boolean not null default false;

alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;

-- Пользователь видит общие и свои адресные оповещения; админ — все.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
    for select to authenticated
    using (user_id is null or user_id = auth.uid() or public.is_admin());

-- Создаёт и отзывает оповещения только администратор.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
    for insert to authenticated
    with check (public.is_admin() and created_by = auth.uid());

drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications
    for delete to authenticated
    using (public.is_admin());

-- Отметки: свои пишет и видит пользователь, админ видит все
-- (счётчик «прочитали N» в истории рассылок).
drop policy if exists notification_reads_select on public.notification_reads;
create policy notification_reads_select on public.notification_reads
    for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

drop policy if exists notification_reads_insert on public.notification_reads;
create policy notification_reads_insert on public.notification_reads
    for insert to authenticated
    with check (user_id = auth.uid() and not public.is_banned());


-- ===== 10. ЗАГЛУШКИ ВКЛАДОК И СИСТЕМНЫЕ СООБЩЕНИЯ ============
-- app_config — глобальные настройки сайта (строка на ключ, value = jsonb).
-- Ключ 'tab_gates': { tabs: { calc: { off: true },
--                             market: { msg: 'текст', msgKind: 'warn' } } }
--   off  — вкладка закрыта заглушкой «раздел в разработке»;
--   msg  — системное сообщение-баннер поверх вкладки (не блокирует).
-- Ключ 'pf_presets': { presets: [ { id, name, snap, at, by } ] } —
--   готовые пресеты раскладки дашборда «Портфели». snap — портативный снимок
--   (карточки портфелей шаблонизированы позиционно pf:#0, pf:#1…). Задаёт админ
--   из настроек раскладки, ВЫБИРАЮТ все пользователи. Пишет только is_admin().
-- Читают ВСЕ, включая гостей (заглушку видит и неавторизованный),
-- пишет только админ.

create table if not exists public.app_config (
    key        text primary key,
    value      jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.app_config is 'Глобальные настройки сайта: заглушки вкладок, системные сообщения…';

create or replace function public.touch_app_config()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists touch_app_config on public.app_config;
create trigger touch_app_config
    before insert or update on public.app_config
    for each row execute function public.touch_app_config();

alter table public.app_config enable row level security;

drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config
    for select to anon, authenticated
    using (true);

drop policy if exists app_config_insert on public.app_config;
create policy app_config_insert on public.app_config
    for insert to authenticated
    with check (public.is_admin());

drop policy if exists app_config_update on public.app_config;
create policy app_config_update on public.app_config
    for update to authenticated
    using (public.is_admin())
    with check (public.is_admin());

-- feature_waitlist — «сообщите, когда раздел будет готов»: подписки
-- пользователей под заглушкой (канал — что человек выбрал для доставки).
create table if not exists public.feature_waitlist (
    user_id    uuid not null references public.profiles(id) on delete cascade,
    tab        text not null,
    channel    text not null default 'site' check (channel in ('site', 'browser', 'telegram')),
    created_at timestamptz not null default now(),
    primary key (user_id, tab)
);

comment on table public.feature_waitlist is 'Подписки «сообщить о готовности раздела» из-под заглушки';

alter table public.feature_waitlist enable row level security;

drop policy if exists feature_waitlist_select on public.feature_waitlist;
create policy feature_waitlist_select on public.feature_waitlist
    for select to authenticated
    using (user_id = auth.uid() or public.is_admin());

drop policy if exists feature_waitlist_insert on public.feature_waitlist;
create policy feature_waitlist_insert on public.feature_waitlist
    for insert to authenticated
    with check (user_id = auth.uid() and not public.is_banned());

drop policy if exists feature_waitlist_update on public.feature_waitlist;
create policy feature_waitlist_update on public.feature_waitlist
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid() and not public.is_banned());

-- свою подписку снимает пользователь; админ чистит список после рассылки
drop policy if exists feature_waitlist_delete on public.feature_waitlist;
create policy feature_waitlist_delete on public.feature_waitlist
    for delete to authenticated
    using (user_id = auth.uid() or public.is_admin());


-- ===== 11. НАЗНАЧЕНИЕ ВЛАДЕЛЬЦА ==============================
-- После того как зарегистрируетесь на сайте, выполните здесь же
-- (подставив свой email):
--
--   update public.profiles set role = 'owner' where email = 'you@example.com';
--
-- Владелец один; дальше роли админов раздаются из админки сайта
-- (только владельцем). Существующим установкам с role = 'admin'
-- нужно один раз поднять свой аккаунт до владельца этой же командой —
-- иначе кнопки ролей в админке останутся недоступными.
-- Передача владения (осознанно, только здесь):
--
--   update public.profiles set role = 'owner' where email = 'new@example.com';
--   update public.profiles set role = 'admin' where email = 'old@example.com';
