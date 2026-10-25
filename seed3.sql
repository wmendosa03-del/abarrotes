-- 3) 4000 clientes con RTN ficticio y único
-- ------------------------------------------------------------
insert into public.clientes (
  nombre, telefono, correo, identidad, direccion, rtn, creado_por
)
select
  nomb.v || ' ' || ap1.v || (case when s.g % 2 = 0 then ' ' || ap2.v else '' end),
  lpad(((s.g * 7919) % 99999999)::text, 8, '0'),
  'cliente' || s.g || '@correo.hn',
  '0801' || lpad(((s.g * 131) % 99999999)::text, 9, '0'),
  col.v || ', Calle ' || ((s.g * 7) % 30 + 1) || ', ' || ciu.v,
  '080199' || lpad(s.g::text, 8, '0'),
  v_admin.id
from generate_series(1, 4000) as s(g)
join lateral (values
  'José'::text, 'María', 'Carlos', 'Ana', 'Luis', 'Sandra', 'Jorge',
  'Karla', 'Miguel', 'Rosa', 'Pedro', 'Diego', 'Lucía', 'Fernanda',
  'Óscar', 'Iris', 'Nelson', 'Diana', 'Wilmer', 'Cecilia', 'Rolando',
  'Elsy', 'Danilo', 'Nohemí', 'Efraín', 'Gabriela', 'Órlin', 'Selvin',
  'Yolanda', 'Gerardo', 'Wendy', 'Krissia', 'Aroldo', 'Miriam',
  'Blanca', 'Balmore', 'Cindy', 'Douglas', 'Elmer', 'Renan'
) with ordinality as nomb(v, ni) on true
join lateral (values
  'López'::text, 'Fuentes', 'Mejía', 'Cárcamo', 'Chávez', 'Padilla',
  'Zelaya', 'Bautista', 'Cruz', 'Molina', 'Ramírez', 'Ochoa', 'Paz',
  'Serrano', 'Fúnez', 'García', 'Martínez', 'Villeda', 'Bonilla',
  'Membreno', 'Cálix', 'Bin', 'Reyes', 'Sosa', 'Guerrero', 'Medina',
  'Castro', 'Sorto', 'Escobar', 'Joya'
) with ordinality as ap1(v, ai) on true
join lateral (values
  'Portillo'::text, 'Salgado', 'Bustillo', 'Vega', 'Santamaría',
  'Rivera', 'Ponce', 'Murillo', 'Bueso', 'Avilés', 'Lemus', 'Melgar',
  'Espinal', 'Saenz', 'Andino', 'Estrada'
) with ordinality as ap2(v, b) on true
join lateral (values
  'Colonia Torre Fuerte'::text, 'Colonia Los Álamos', 'Colonia Villa Nueva',
  'Barrio La Isla', 'Colonia Palmira', 'Residencial Vista Verde',
  'Colonia Kennedy', 'Barrio La Granja', 'Colonia El Roble',
  'Colonia San Jorge', 'Colonia Miraflores', 'Barrio El Centro'
) with ordinality as col(v, ci2) on true
join lateral (values
  'Tegucigalpa'::text, 'Comayagüela', 'San Pedro Sula', 'Choluteca',
  'Comayagua', 'La Ceiba', 'Danlí', 'Juticalpa'
) with ordinality as ciu(v, ci3) on true
join (
  select id from auth.users where email = 'wmendosa03@accounts.wsservices.invalid'
  union all
  select id from auth.users where email = 'wmendosa03@gmail.com'
    and not exists (select 1 from auth.users where email = 'wmendosa03@accounts.wsservices.invalid')
  limit 1
) as v_admin on true
where nomb.ni = ((s.g - 1) % 40) + 1
  and ap1.ai = ((s.g - 1) % 30) + 1
  and ap2.b = ((s.g * 17) % 16) + 1
  and col.ci2 = ((s.g * 3) % 12) + 1
  and ciu.ci3 = ((s.g * 5) % 8) + 1
  and not exists (
    select 1 from public.clientes c where c.rtn = '080199' || lpad(s.g::text, 8, '0')
  );

-- ------------------------------------------------------------