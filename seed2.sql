-- 2) 9000 productos (EAN-13 prefijo 200 con checksum válido)
-- ------------------------------------------------------------
with base as (
  select
    g,
    '200' || lpad(g::text, 9, '0') as body
  from generate_series(1, 9000) as g
  where not exists (
    select 1 from public.productos p
    where p.codigo = '200' || lpad(g::text, 9, '0')
  )
),
sumas as (
  select
    b.g,
    b.body,
    sum(d.letra * case when d.i % 2 = 1 then 1 else 3 end) as suma
  from base b
  cross join lateral (
    select generate_series(1, 12) as i, (substring(b.body from i for 1))::int as letra
  ) d
  group by b.g, b.body
)
insert into public.productos (
  codigo, nombre, categoria, unidad, precio, costo, impuesto_porcentaje,
  stock, stock_minimo, activo, creado_por
)
select
  s.body || cast((10 - (s.suma % 10)) % 10 as text),
  cat.v || ' ' || marca.v || ' ' || pres.v || ' x' || ((s.g * 13) % 997 + 1),
  cat.v,
  un.u,
  (((s.g * 37) % 895) + 6)::numeric,
  round(((((s.g * 37) % 895) + 6)::numeric * (0.55 + ((s.g % 30)::numeric / 100))), 0),
  case when s.g % 20 = 0 then 0 else 15 end,
  floor(random() * 320 + 1)::numeric,
  floor(random() * 10 + 4)::numeric,
  (s.g % 25) <> 17,
  v_admin.id
from sumas s
join lateral (values
  'Abarrotes'::text, 'Bebidas', 'Lácteos', 'Panadería', 'Cárnicos',
  'Congelados', 'Snacks', 'Dulces', 'Condimentos', 'Cereales',
  'Conservas', 'Salsas', 'Limpieza', 'Higiene Personal', 'Mascotas',
  'Frutas y Verduras', 'Papelería', 'Bebé', 'Automotriz', 'Botanas'
) with ordinality as cat(v, ci) on true
join lateral (values
  'Redisol'::text, 'Alpina', 'Knorr Mágica', 'Sula', 'Mipro', 'Nido',
  'Chiquita', 'Goliat', 'Zanjón', 'Capri', 'Ever', 'Frisco', 'Diana',
  'Rocky', 'Nestlé', 'Kraft', 'Unilever', 'Bella', 'Doña María',
  'Fama de Dios', 'Vitar', 'Costeñas', 'San Antonio', 'Lempira',
  'Pura Vida', 'Pan Bon', 'La Ideal', 'Corona', 'Sasa', 'Escudo',
  'Pelita', 'Antores', 'Delicias', 'Sol', 'Yuka', 'Máquina',
  'Ralston', 'Bueno', 'Faro', 'Trébol'
) with ordinality as marca(v, mi) on true
join lateral (values
  ('250 g'::text, 'Kilogramo'), ('500 g', 'Kilogramo'), ('1 kg', 'Kilogramo'),
  ('2 kg', 'Kilogramo'), ('355 ml', 'Litro'), ('1 L', 'Litro'),
  ('2 L', 'Litro'), ('paquete', 'Paquete'), ('caja', 'Caja'),
  ('bolsa', 'Unidad'), ('lata', 'Unidad'), ('docena', 'Docena'),
  ('12 und', 'Paquete'), ('24 und', 'Caja'), ('servicio', 'Unidad')
) with ordinality as pres(v, u, pi) on true
join (
  select id from auth.users where email = 'wmendosa03@accounts.wsservices.invalid'
  union all
  select id from auth.users where email = 'wmendosa03@gmail.com'
    and not exists (select 1 from auth.users where email = 'wmendosa03@accounts.wsservices.invalid')
  limit 1
) as v_admin on true
where cat.ci = ((s.g - 1) % 20) + 1
  and marca.mi = 1 + ((s.g * 7 - 3) % 40)
  and pres.pi = 1 + ((s.g * 11 + 2) % 15);

-- ------------------------------------------------------------