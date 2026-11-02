-- VIP Ruta Segura · esquema Postgres (Neon). Es idempotente: server.js lo ejecuta al arrancar.

create table if not exists users (
  id              bigserial primary key,
  email           text not null,
  dni             char(8),
  name            text not null,
  phone           text,
  pass_hash       text not null,
  is_admin        boolean not null default false,
  blocked         boolean not null default false,
  blocked_reason  text,
  emerg_name      text,
  emerg_phone     text,
  selfie_file_id  bigint,
  dni_file_id     bigint,
  -- revisión manual del pasajero (selfie + foto del DNI) -> insignia «Pasajero confiable»
  pax_status      text not null default 'none' check (pax_status in ('none','pending','approved','rejected')),
  pax_note        text,
  created_at      timestamptz not null default now()
);
create unique index if not exists users_email_uq on users (lower(email));
create unique index if not exists users_dni_uq on users (dni) where dni is not null;

-- Perfil de chófer: documentos, vehículo y números donde cobra (Yape/Plin).
create table if not exists driver_profiles (
  user_id        bigint primary key references users(id) on delete cascade,
  lic_num        text,
  lic_cat        text not null default 'A-IIa',
  lic_file_id    bigint,
  vtype          text not null default 'minivan' check (vtype in ('auto','camioneta','minivan')),
  model          text,
  plate          text,
  color          text not null default '#ECEEF1',
  veh_ext_file_id bigint,
  veh_int_file_id bigint,
  veh_bag_file_id bigint,
  soat_until     date,
  soat_file_id   bigint,
  rt_ok          boolean not null default false,
  ant_file_id    bigint,
  yape_phone     text,
  plin_phone     text,
  status         text not null default 'draft' check (status in ('draft','pending','approved','rejected')),
  review_note    text,
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Imágenes y PDF (selfie, DNI, licencia, SOAT, vehículo, capturas de pago) guardados en la propia BD.
create table if not exists files (
  id          bigserial primary key,
  owner_id    bigint not null references users(id) on delete cascade,
  kind        text not null,
  mime        text not null,
  data        bytea not null,
  created_at  timestamptz not null default now()
);
create index if not exists files_owner_idx on files (owner_id, kind);

create table if not exists email_codes (
  id          bigserial primary key,
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  used        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists email_codes_email_idx on email_codes (lower(email), created_at desc);

create table if not exists trips (
  id          bigserial primary key,
  driver_id   bigint not null references users(id),
  from_off    text not null check (from_off in ('tru','chi')),
  trip_date   date not null,
  dep_time    text not null check (dep_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  dep_at      timestamptz not null,
  price       numeric(7,2) not null check (price >= 20 and price <= 120),
  seats       int not null check (seats between 1 and 8),
  vtype       text not null,
  veh_model   text,
  veh_plate   text,
  veh_color   text,
  status      text not null default 'active' check (status in ('active','started','finished','cancelled')),
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists trips_search_idx on trips (trip_date, from_off, status);
create index if not exists trips_driver_idx on trips (driver_id, dep_at);

create table if not exists bookings (
  id           bigserial primary key,
  code         text not null unique,
  trip_id      bigint not null references trips(id),
  user_id      bigint not null references users(id),
  status       text not null check (status in ('hold','por_confirmar','confirmado','rechazado','cancelado','expirado','no_presentado')),
  hold_until   timestamptz,
  subtotal     numeric(8,2) not null default 0,
  promo_name   text,
  promo_pct    int not null default 0,
  total        numeric(8,2) not null default 0,
  rated        boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists bookings_trip_idx on bookings (trip_id, status);
create index if not exists bookings_user_idx on bookings (user_id, created_at desc);

create table if not exists booking_seats (
  id           bigserial primary key,
  booking_id   bigint not null references bookings(id) on delete cascade,
  trip_id      bigint not null references trips(id),
  seat         int not null check (seat between 1 and 8),
  active       boolean not null default true,
  boarded_at   timestamptz,
  released_at  timestamptz,
  noshow       boolean not null default false,
  pax_rating   smallint check (pax_rating between 1 and 5)
);
-- Un asiento solo puede estar activo una vez por viaje: evita reservarlo dos veces.
create unique index if not exists booking_seats_active_uq on booking_seats (trip_id, seat) where active;
create index if not exists booking_seats_booking_idx on booking_seats (booking_id);

create table if not exists payments (
  id              bigserial primary key,
  booking_id      bigint not null unique references bookings(id) on delete cascade,
  method          text not null check (method in ('yape','plin')),
  amount          numeric(8,2) not null,
  operation_no    text not null,
  capture_file_id bigint,
  status          text not null default 'pendiente' check (status in ('pendiente','confirmado','rechazado')),
  note            text,
  decided_by      bigint references users(id),
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists payments_status_idx on payments (status, created_at desc);

create table if not exists reviews (
  id            bigserial primary key,
  booking_id    bigint not null unique references bookings(id) on delete cascade,
  trip_id       bigint not null references trips(id),
  driver_id     bigint not null references users(id),
  passenger_id  bigint not null references users(id),
  stars         smallint not null check (stars between 1 and 5),
  tags          text[] not null default '{}',
  flags         text[] not null default '{}',
  comment       text,
  created_at    timestamptz not null default now()
);
create index if not exists reviews_driver_idx on reviews (driver_id, created_at desc);

create table if not exists incidents (
  id          bigserial primary key,
  kind        text not null check (kind in ('sos','reporte')),
  trip_id     bigint references trips(id),
  user_id     bigint references users(id),
  booking_id  bigint references bookings(id),
  issues      text[] not null default '{}',
  lat         double precision,
  lon         double precision,
  status      text not null default 'abierto' check (status in ('abierto','resuelto')),
  resolved_by bigint references users(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists incidents_status_idx on incidents (status, created_at desc);

-- Última posición GPS que transmite el chófer durante el viaje.
create table if not exists live_locations (
  trip_id     bigint primary key references trips(id) on delete cascade,
  lat         double precision not null,
  lon         double precision not null,
  speed_kmh   real,
  updated_at  timestamptz not null default now()
);
