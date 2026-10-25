-- ============================================================
-- SEMILLA: SUPER TIENDA (datos ficticios de prueba)
-- Genera:
--   1  empresa/CAI ficticio
--   9000 productos
--   4000 clientes con RTN
--   2000 ventas distribuidas en los últimos 30 días (~1 mes)
-- Requiere: "data base pos.sql" y "data base cai.sql" ejecutados
-- Idempotente en productos, clientes y CAI.
-- Las ventas NO son idempotentes: si ya se generaron no repetir.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Empresa / CAI ficticio
-- ------------------------------------------------------------
insert into public.configuracion_cai (
  cai, rtn_emisor, establecimiento, punto_emision, tipo_documento,
  correlativo_desde, correlativo_hasta, correlativo_actual, fecha_limite,
  activo, negocio, direccion, telefono, pie_factura, creado_por
)
select
  '59A5-5A10-BM21-2019-00048',
  '08019998877665',
  '001', '001', '01',
  1, 8000, 0, date '2030-12-31',
  true,
  'WS Supermercados Mi Zona',
  'Boulevard La Granja, Colonia Torre Fuerte, Tegucigalpa, Honduras',
  '2231-9876',
  '¡Gracias por su compra!',
  v_admin.id
from (
  select id from auth.users where email = 'wmendosa03@accounts.wsservices.invalid'
  union all
  select id from auth.users where email = 'wmendosa03@gmail.com'
    and not exists (select 1 from auth.users where email = 'wmendosa03@accounts.wsservices.invalid')
  limit 1
) as v_admin
where not exists (
  select 1 from public.configuracion_cai where cai = '59A5-5A10-BM21-2019-00048'
);

-- ------------------------------------------------------------