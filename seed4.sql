-- 4) 2000 ventas de los últimos 30 días (~1 mes de trabajo)
--    85% facturas con CAI correlativo, 15% recibos
-- ------------------------------------------------------------
do $seed$
declare
  v_admin uuid;
  v_cai_id bigint;
  v_max_venta bigint;
  v_cor bigint := 0;
  v_from_corr bigint := 0;
  pids bigint[]; pcods text[]; pnom text[]; pun text[]; pprecio numeric[]; pcosto numeric[]; ptasa numeric[]; pcount int;
  cids bigint[]; cnoms text[]; crtnts text[];
  i int; j int; n_it int; k int; idx int;
  r double precision;
  v_tipo text; v_met text; v_banco text; v_vend text;
  v_fecha timestamptz;
  v_cli_id bigint; v_cli_nom text; v_cli_rtn text;
  arr_pid bigint[] := '{}'::bigint[]; arr_cod text[] := '{}'::text[];
  arr_nom text[] := '{}'::text[]; arr_un text[] := '{}'::text[];
  arr_qty numeric[] := '{}'::numeric[]; arr_pp numeric[] := '{}'::numeric[];
  arr_cs numeric[] := '{}'::numeric[]; arr_tr numeric[] := '{}'::numeric[];
  arr_gr numeric[] := '{}'::numeric[]; arr_tx numeric[] := '{}'::numeric[];
  v_qty numeric; v_gr numeric; v_tx numeric; v_pp numeric; v_cs numeric; v_tr numeric;
  v_sub numeric; v_desc numeric; v_tot numeric; v_inc numeric; v_fac numeric;
  v_rec numeric; v_cam numeric; v_no_fact text;
  v_venta_id bigint;
  bancos text[] := array['Banco Atlántida', 'Bac Credomatic', 'Davivienda', 'Ficohsa', 'Banrural', 'Occidente', 'La Hipotecaria'];
  vendedores text[] := array['Ana Ramírez', 'Rodrigo Serrano', 'Karla Molina', 'Julio Cáceres', 'Diana Ochoa'];
begin
  select id into v_admin from auth.users where email = 'wmendosa03@accounts.wsservices.invalid';
  if v_admin is null then
    select id into v_admin from auth.users order by created_at limit 1;
  end if;

  select c.id into v_cai_id
  from public.configuracion_cai c
  where c.activo = true and c.cai = '59A5-5A10-BM21-2019-00048'
  limit 1;
  if v_cai_id is null then
    select id into v_cai_id from public.configuracion_cai where activo = true order by id limit 1;
  end if;

  select coalesce(max(numero_venta), 0) into v_max_venta from public.ventas;
  v_from_corr := (select coalesce(max(correlativo), 0) from public.ventas where cai_id = v_cai_id);
  v_cor := v_from_corr;

  select array_agg(id), array_agg(codigo), array_agg(nombre), array_agg(unidad),
         array_agg(precio), array_agg(costo), array_agg(impuesto_porcentaje), count(*)
    into pids, pcods, pnom, pun, pprecio, pcosto, ptasa, pcount
    from public.productos where activo = true;

  select array_agg(id), array_agg(nombre), array_agg(rtn)
    into cids, cnoms, crtnts
    from public.clientes;
  if array_length(cids, 1) is null or array_length(cids, 1) = 0 then
    cids := array_agg(null::bigint); -- sin clientes: Consumidor Final
    cnoms := array_agg(null::text);
    crtnts := array_agg(null::text);
  end if;

  raise notice 'Productos activos: % | Clientes: % | venta base: %', pcount, coalesce(array_length(cids,1),0), v_max_venta;

  for i in 1 .. 2000 loop
    arr_pid := '{}'::bigint[]; arr_cod := '{}'::text[]; arr_nom := '{}'::text[];
    arr_un := '{}'::text[]; arr_qty := '{}'::numeric[]; arr_pp := '{}'::numeric[];
    arr_cs := '{}'::numeric[]; arr_tr := '{}'::numeric[];
    arr_gr := '{}'::numeric[]; arr_tx := '{}'::numeric[];

    r := random();
    v_tipo := case when r < 0.85 then 'Factura' else 'Recibo' end;
    v_met := case
      when random() < 0.6 then 'Efectivo'
      when random() < 0.75 then 'Tarjeta'
      else 'Transferencia' end;
    v_banco := case when v_met = 'Tarjeta' then bancos[1 + floor(random() * array_length(bancos, 1))::int] else '' end;
    v_vend := vendedores[1 + floor(random() * array_length(vendedores, 1))::int];
    v_fecha := now() - ((random() * 29)::int * interval '1 day') - (random() * interval '12 hours');

    if array_length(cids, 1) is not null and array_length(cids, 1) > 0 and random() < 0.97 then
      idx := 1 + floor(random() * array_length(cids, 1))::int;
      v_cli_id := cids[idx]; v_cli_nom := cnoms[idx]; v_cli_rtn := coalesce(crtnts[idx], '');
    else
      v_cli_id := null; v_cli_nom := 'Consumidor Final'; v_cli_rtn := '';
    end if;

    n_it := 1 + floor(random() * 5)::int;
    for j in 1 .. n_it loop
      idx := 1 + floor(random() * pcount)::int;
      v_qty := round((1 + floor(random() * 37)) * 0.25, 3);
      if v_qty <= 0 then v_qty := 1; end if;
      v_pp := pprecio[idx]; v_cs := pcosto[idx]; v_tr := ptasa[idx];
      v_gr := round(v_pp * v_qty, 2);
      v_tx := round(v_gr - (v_gr / (1 + (v_tr / 100))), 2);
      arr_pid := arr_pid || pids[idx]; arr_cod := arr_cod || pcods[idx];
      arr_nom := arr_nom || pnom[idx]; arr_un := arr_un || pun[idx];
      arr_qty := arr_qty || v_qty; arr_pp := arr_pp || v_pp;
      arr_cs := arr_cs || v_cs; arr_tr := arr_tr || v_tr;
      arr_gr := arr_gr || v_gr; arr_tx := arr_tx || v_tx;
    end loop;

    select coalesce(sum(g), 0), coalesce(sum(tx), 0)
      into v_sub, v_inc
      from unnest(arr_gr, arr_tx) as t(g, tx);

    v_desc := case when random() < 0.25 then round(v_sub * (case when random() < 0.7 then 0.05 else 0.10 end), 2) else 0 end;
    v_tot := round(v_sub - v_desc, 2);
    v_fac := case when v_sub > 0 then v_tot / v_sub else 0 end;

    if v_met = 'Efectivo' then
      v_rec := case when random() < 0.35 then v_tot else ceil(v_tot / 20) * 20 end;
    else
      v_rec := v_tot;
    end if;
    v_cam := round(greatest(v_rec - v_tot, 0), 2);

    v_no_fact := case
      when v_tipo = 'Factura' then
        '0001-0001-0001-0001-' || lpad((v_cor + 1)::text, 5, '0')
      else '' end;
    if v_tipo = 'Factura' then v_cor := v_cor + 1; end if;

    insert into public.ventas (
      numero_venta, fecha, cliente_id, cliente_nombre, cliente_rtn, tipo_documento,
      subtotal, descuento, impuesto, base_gravada, total, metodo_pago,
      monto_recibido, cambio, estado, nota, vendedor_id, vendedor_nombre,
      creado_por, cai_id, numero_factura, correlativo
    ) values (
      v_max_venta + i, v_fecha, v_cli_id, v_cli_nom,
      case when v_tipo = 'Factura' then v_cli_rtn else '' end,
      v_tipo, v_sub, v_desc,
      round(v_inc * v_fac, 2), round(v_tot - (v_inc * v_fac), 2), v_tot,
      v_met, v_rec, v_cam, 'Completada', '', null, v_vend, v_admin,
      case when v_tipo = 'Factura' then v_cai_id else null end,
      v_no_fact,
      case when v_tipo = 'Factura' then v_cor else null end
    ) returning id into v_venta_id;

    insert into public.venta_detalle (
      venta_id, producto_id, codigo, nombre, unidad, cantidad,
      precio_unitario, costo_unitario, impuesto_porcentaje, impuesto_monto,
      descuento, subtotal
    )
    select
      v_venta_id, arr_pid[k], arr_cod[k], arr_nom[k], arr_un[k], arr_qty[k],
      arr_pp[k], arr_cs[k], arr_tr[k], round(arr_tx[k] * v_fac, 2), 0, arr_gr[k]
    from generate_subscripts(arr_pid, 1) as k;
  end loop;

  if v_cai_id is not null and v_cor > v_from_corr then
    update public.configuracion_cai set correlativo_actual = v_cor where id = v_cai_id;
  end if;

  -- Descuento el inventario vendido (realismo) y avisamos
  update public.productos p
  set stock = greatest(0, p.stock - vendido.q)
  from (
    select producto_id, sum(cantidad) as q
    from public.venta_detalle
    where venta_id in (select id from public.ventas where numero_venta > v_max_venta)
      and producto_id is not null
    group by producto_id
  ) as vendido
  where vendido.producto_id = p.id;

  raise notice 'Ventas creadas: % | Facturas correlativ % → %', 2000, v_from_corr + 1, v_cor;
end $seed$;

-- ------------------------------------------------------------