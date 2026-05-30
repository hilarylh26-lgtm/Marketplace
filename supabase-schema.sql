-- =========================================================================
-- RSU MARKETPLACE — SCHEMA UNIFICADO Y COMPLETO
-- Ejecutar completo en Supabase > SQL Editor
-- =========================================================================

-- =========================================================================
-- 1. TABLAS
-- =========================================================================

create table if not exists public.perfiles (
    id uuid primary key references auth.users(id) on delete cascade,
    nombre_usuario text,
    nombre_empresa text not null,
    "RFC" text,
    tipo_actividad text,
    registro_padron text,
    email text,
    contacto text,
    ubicacion text default 'San Luis Potosí, México',
    logo_url text,
    logo_path text,
    certificado boolean default false,
    estado_cuenta text not null default 'activa',
    dark_mode boolean not null default false,
    idioma text not null default 'es-MX',
    created_at timestamptz default now()
);

create table if not exists public.publicaciones (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    titulo text not null,
    empresa text,
    categoria text not null default 'material',
    estado text not null default 'available',
    certificado boolean default false,
    volumen_tons numeric not null default 0,
    unidad_medida text not null default 'tons',
    precio numeric not null default 0,
    distancia_km numeric not null default 0,
    ubicacion text,
    direccion_google text,
    latitud numeric,
    longitud numeric,
    presentacion text,
    pureza numeric default 100,
    descripcion text,
    imagenes text[] default '{}',
    requiere_flete boolean default false,
    tiene_montacargas boolean default false,
    created_at timestamptz default now()
);

create table if not exists public.favoritos (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
    created_at timestamptz default now(),
    unique (user_id, publicacion_id)
);

create table if not exists public.mensajes (
    id uuid primary key default gen_random_uuid(),
    publicacion_id uuid references public.publicaciones(id) on delete cascade,
    sender_id uuid references auth.users(id) on delete cascade,
    receiver_id uuid references auth.users(id) on delete cascade,
    contenido text not null,
    created_at timestamptz default now()
);

create table if not exists public.transacciones (
    id uuid primary key default gen_random_uuid(),
    publicacion_id uuid not null references public.publicaciones(id) on delete cascade,
    comprador_id uuid not null references auth.users(id) on delete cascade,
    vendedor_id uuid not null references auth.users(id) on delete cascade,
    precio_acordado numeric not null default 0,
    metodo_pago text not null default 'efectivo' check (metodo_pago = 'efectivo'),
    estado text not null default 'pendiente_efectivo',
    notas text,
    comprador_nombre text,
    vendedor_nombre text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (publicacion_id, comprador_id)
);

-- =========================================================================
-- 2. PARCHES SEGUROS (agrega columnas si no existen)
-- =========================================================================

alter table public.perfiles
    add column if not exists nombre_usuario text,
    add column if not exists contacto text,
    add column if not exists ubicacion text default 'San Luis Potosí, México',
    add column if not exists logo_url text,
    add column if not exists logo_path text,
    add column if not exists certificado boolean default false,
    add column if not exists estado_cuenta text not null default 'activa',
    add column if not exists dark_mode boolean not null default false,
    add column if not exists idioma text not null default 'es-MX';

alter table public.publicaciones
    add column if not exists unidad_medida text not null default 'tons',
    add column if not exists imagenes text[] default '{}',
    add column if not exists direccion_google text,
    add column if not exists latitud numeric,
    add column if not exists longitud numeric,
    add column if not exists presentacion text,
    add column if not exists pureza numeric default 100,
    add column if not exists descripcion text,
    add column if not exists requiere_flete boolean default false,
    add column if not exists tiene_montacargas boolean default false;

alter table public.transacciones
    add column if not exists comprador_nombre text,
    add column if not exists vendedor_nombre text;

-- =========================================================================
-- 3. STORAGE
-- =========================================================================

insert into storage.buckets (id, name, public)
values
    ('logos', 'logos', true),
    ('publicaciones', 'publicaciones', true)
on conflict (id) do update set public = excluded.public;

-- =========================================================================
-- 4. TRIGGER — CREAR PERFIL AL REGISTRAR USUARIO
-- Captura todos los campos posibles del metadata
-- =========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.perfiles (
        id,
        email,
        nombre_usuario,
        nombre_empresa,
        "RFC",
        tipo_actividad,
        registro_padron,
        contacto,
        ubicacion
    )
    values (
        new.id,
        new.email,
        coalesce(
            new.raw_user_meta_data->>'nombre_usuario',
            new.raw_user_meta_data->>'nombre_empresa',
            split_part(new.email, '@', 1)
        ),
        coalesce(new.raw_user_meta_data->>'nombre_empresa', new.email),
        new.raw_user_meta_data->>'RFC',
        new.raw_user_meta_data->>'tipo_actividad',
        new.raw_user_meta_data->>'registro_padron',
        new.raw_user_meta_data->>'contacto',
        coalesce(new.raw_user_meta_data->>'ubicacion', 'San Luis Potosí, México')
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================================
-- 5. FUNCIÓN — ELIMINAR CUENTA COMPLETA
-- Borra storage, publicaciones y usuario en cascada
-- =========================================================================

create or replace function public.delete_current_user_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
    current_user_id uuid := auth.uid();
    deleted_publications integer := 0;
begin
    if current_user_id is null then
        raise exception 'Debes iniciar sesión para eliminar tu cuenta.';
    end if;

    -- Borrar imágenes del storage
    delete from storage.objects
    where bucket_id in ('logos', 'publicaciones')
      and (storage.foldername(name))[1] = current_user_id::text;

    -- Borrar publicaciones
    delete from public.publicaciones
    where user_id = current_user_id;
    get diagnostics deleted_publications = row_count;

    -- Borrar usuario (cascada elimina perfil, favoritos, transacciones, mensajes)
    delete from auth.users
    where id = current_user_id;

    return jsonb_build_object(
        'deleted', true,
        'publications_deleted', deleted_publications
    );
end;
$$;

revoke all on function public.delete_current_user_account() from public;
grant execute on function public.delete_current_user_account() to authenticated;

-- =========================================================================
-- 6. RLS — HABILITAR SEGURIDAD EN TODAS LAS TABLAS
-- =========================================================================

alter table public.perfiles enable row level security;
alter table public.publicaciones enable row level security;
alter table public.favoritos enable row level security;
alter table public.mensajes enable row level security;
alter table public.transacciones enable row level security;

-- =========================================================================
-- 7. POLÍTICAS
-- =========================================================================

-- -------------------------------------------------------------------------
-- PERFILES
-- SELECT público: necesario para que el marketplace muestre nombre de empresa
-- en las publicaciones de otros usuarios
-- -------------------------------------------------------------------------
drop policy if exists "perfiles_select_own" on public.perfiles;
drop policy if exists "perfiles_select_all" on public.perfiles;
create policy "perfiles_select_all" on public.perfiles
    for select using (true);

drop policy if exists "perfiles_insert_own" on public.perfiles;
create policy "perfiles_insert_own" on public.perfiles
    for insert with check (auth.uid() = id);

drop policy if exists "perfiles_update_own" on public.perfiles;
create policy "perfiles_update_own" on public.perfiles
    for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "perfiles_delete_own" on public.perfiles;
create policy "perfiles_delete_own" on public.perfiles
    for delete using (auth.uid() = id);

-- -------------------------------------------------------------------------
-- PUBLICACIONES
-- -------------------------------------------------------------------------
drop policy if exists "publicaciones_select_all" on public.publicaciones;
create policy "publicaciones_select_all" on public.publicaciones
    for select using (true);

drop policy if exists "publicaciones_insert_own" on public.publicaciones;
create policy "publicaciones_insert_own" on public.publicaciones
    for insert with check (auth.uid() = user_id);

drop policy if exists "publicaciones_update_own" on public.publicaciones;
create policy "publicaciones_update_own" on public.publicaciones
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "publicaciones_delete_own" on public.publicaciones;
create policy "publicaciones_delete_own" on public.publicaciones
    for delete using (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- FAVORITOS
-- -------------------------------------------------------------------------
drop policy if exists "favoritos_select_own" on public.favoritos;
create policy "favoritos_select_own" on public.favoritos
    for select using (auth.uid() = user_id);

drop policy if exists "favoritos_insert_own" on public.favoritos;
create policy "favoritos_insert_own" on public.favoritos
    for insert with check (auth.uid() = user_id);

drop policy if exists "favoritos_delete_own" on public.favoritos;
create policy "favoritos_delete_own" on public.favoritos
    for delete using (auth.uid() = user_id);

-- -------------------------------------------------------------------------
-- MENSAJES
-- -------------------------------------------------------------------------
drop policy if exists "mensajes_select_participants" on public.mensajes;
create policy "mensajes_select_participants" on public.mensajes
    for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

drop policy if exists "mensajes_insert_sender" on public.mensajes;
create policy "mensajes_insert_sender" on public.mensajes
    for insert with check (auth.uid() = sender_id);

drop policy if exists "mensajes_delete_sender" on public.mensajes;
create policy "mensajes_delete_sender" on public.mensajes
    for delete using (auth.uid() = sender_id);

-- -------------------------------------------------------------------------
-- TRANSACCIONES
-- -------------------------------------------------------------------------
drop policy if exists "transacciones_select_participants" on public.transacciones;
create policy "transacciones_select_participants" on public.transacciones
    for select using (auth.uid() = comprador_id or auth.uid() = vendedor_id);

drop policy if exists "transacciones_insert_buyer_cash" on public.transacciones;
create policy "transacciones_insert_buyer_cash" on public.transacciones
    for insert with check (
        auth.uid() = comprador_id
        and metodo_pago = 'efectivo'
    );

drop policy if exists "transacciones_update_participants" on public.transacciones;
create policy "transacciones_update_participants" on public.transacciones
    for update using (auth.uid() = comprador_id or auth.uid() = vendedor_id)
    with check (auth.uid() = comprador_id or auth.uid() = vendedor_id);

drop policy if exists "transacciones_delete_participants" on public.transacciones;
create policy "transacciones_delete_participants" on public.transacciones
    for delete using (auth.uid() = comprador_id or auth.uid() = vendedor_id);

-- -------------------------------------------------------------------------
-- STORAGE — LOGOS
-- -------------------------------------------------------------------------
drop policy if exists "logos_select_public" on storage.objects;
create policy "logos_select_public" on storage.objects
    for select using (bucket_id = 'logos');

drop policy if exists "logos_insert_own" on storage.objects;
create policy "logos_insert_own" on storage.objects
    for insert with check (
        bucket_id = 'logos'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

drop policy if exists "logos_update_own" on storage.objects;
create policy "logos_update_own" on storage.objects
    for update using (
        bucket_id = 'logos'
        and auth.uid()::text = (storage.foldername(name))[1]
    ) with check (
        bucket_id = 'logos'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

drop policy if exists "logos_delete_own" on storage.objects;
create policy "logos_delete_own" on storage.objects
    for delete using (
        bucket_id = 'logos'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

-- -------------------------------------------------------------------------
-- STORAGE — PUBLICACIONES
-- -------------------------------------------------------------------------
drop policy if exists "publication_images_select_public" on storage.objects;
create policy "publication_images_select_public" on storage.objects
    for select using (bucket_id = 'publicaciones');

drop policy if exists "publication_images_insert_own" on storage.objects;
create policy "publication_images_insert_own" on storage.objects
    for insert with check (
        bucket_id = 'publicaciones'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

drop policy if exists "publication_images_update_own" on storage.objects;
create policy "publication_images_update_own" on storage.objects
    for update using (
        bucket_id = 'publicaciones'
        and auth.uid()::text = (storage.foldername(name))[1]
    ) with check (
        bucket_id = 'publicaciones'
        and auth.uid()::text = (storage.foldername(name))[1]
    );

drop policy if exists "publication_images_delete_own" on storage.objects;
create policy "publication_images_delete_own" on storage.objects
    for delete using (
        bucket_id = 'publicaciones'
        and auth.uid()::text = (storage.foldername(name))[1]
    );