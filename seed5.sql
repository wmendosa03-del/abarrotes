-- 5) Resumen
-- ------------------------------------------------------------
select
  (select count(*) from public.productos) as productos,
  (select count(*) from public.clientes) as clientes,
  (select count(*) from public.ventas) as ventas,
  (select count(*) from public.venta_detalle) as lineas_venta,
  (select negocio from public.configuracion_cai where cai = '59A5-5A10-BM21-2019-00048') as negocio,
  (select rtn_emisor from public.configuracion_cai where cai = '59A5-5A10-BM21-2019-00048') as rtn,
  (select cai from public.configuracion_cai where cai = '59A5-5A10-BM21-2019-00048') as cai;