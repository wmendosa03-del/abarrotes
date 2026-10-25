-- ============================================================
--  WS Abarrotes · Módulo CAI (Código de Autorización de Impresión)
--  Cumplimiento fiscal SAR - Honduras. Factura comercial térmica 80mm.
--  Ejecutar DESPUÉS de "data base pos.sql" (es idempotente).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla de configuración CAI (un rango autorizado por fila)
-- ------------------------------------------------------------
create table if not exists public.configuracion_cai (
	id bigint generated always as identity primary key,
	cai text not null check (length(trim(cai)) > 0),
	rtn_emisor text not null check (length(btrim(rtn_emisor)) = 14),
	establecimiento text not null default '001',
	punto_emision text not null default '001',
	tipo_documento text not null default '01'
		check (tipo_documento in ('01', '02')),
	correlativo_desde bigint not null default 1 check (correlativo_desde >= 1),
	correlativo_hasta bigint not null default 100 check (correlativo_hasta >= 1),
	correlativo_actual bigint not null default 0 check (correlativo_actual >= 0),
	fecha_limite date not null,
	activo boolean not null default true,
	negocio text not null default 'WS Abarrotes',
	direccion text not null default '',
	telefono text not null default '',
	pie_factura text not null default '¡Gracias por su compra!',
	creado_por uuid not null references auth.users(id),
	creado_en timestamptz not null default now(),
	constraint ck_cai_rango check (correlativo_desde <= correlativo_hasta),
	constraint ck_cai_actual check (correlativo_actual >= correlativo_desde - 1
		and correlativo_actual <= correlativo_hasta)
);
create index if not exists cai_activo_idx on public.configuracion_cai (activo, fecha_limite desc)
	where activo = true;

-- ------------------------------------------------------------
-- 2. Columnas CAI en ventas
-- ------------------------------------------------------------
alter table public.ventas
	add column if not exists cai_id bigint references public.configuracion_cai(id),
	add column if not exists numero_factura text not null default '',
	add column if not exists correlativo bigint;
create index if not exists ventas_cai_idx on public.ventas (cai_id, fecha desc);
create index if not exists ventas_numero_factura_idx on public.ventas (numero_factura);

-- ------------------------------------------------------------
-- 3. RLS y permisos
-- ------------------------------------------------------------
alter table public.configuracion_cai enable row level security;
revoke all on table public.configuracion_cai from public, anon;
grant select on table public.configuracion_cai to authenticated;
drop policy if exists "pos can read cai" on public.configuracion_cai;
create policy "pos can read cai"
	on public.configuracion_cai for select to authenticated
	using (public.usuario_tiene_rol(array['admin', 'supervisor', 'caja', 'vendedor', 'reception']));

-- ------------------------------------------------------------
-- 4. RPC: siguiente correlativo (con validaciones)
-- ------------------------------------------------------------
drop function if exists public.numero_siguiente_factura(bigint);
create or replace function public.numero_siguiente_factura(p_cai_id bigint default null)
returns table(numero_factura text, correlativo bigint, cai text, fecha_limite date)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cai public.configuracion_cai;
	v_numero bigint;
begin
	if auth.uid() is null or not public.usuario_tiene_rol(array['admin', 'supervisor', 'caja', 'vendedor', 'reception']) then
		raise exception 'Usuario no autorizado' using errcode = '42501';
	end if;

	if p_cai_id is null then
		select * into v_cai from public.configuracion_cai
		where activo = true order by creado_en desc limit 1;
	else
		select * into v_cai from public.configuracion_cai where id = p_cai_id;
	end if;

	if v_cai.id is null then
		raise exception 'No hay CAI activo configurado. Ingrésalo en Configuración.';
	end if;

	if current_date > v_cai.fecha_limite then
		raise exception 'El CAI ha expirado. Fecha límite: %', v_cai.fecha_limite;
	end if;

	if v_cai.correlativo_actual >= v_cai.correlativo_hasta then
		raise exception 'Se agotó el rango autorizado del CAI. Solicite un nuevo rango.';
	end if;

	v_numero := v_cai.correlativo_actual + 1;

	update public.configuracion_cai
	set correlativo_actual = v_numero
	where id = v_cai.id;

	return query select
		v_cai.establecimiento || '-' || v_cai.punto_emision || '-' || v_cai.tipo_documento || '-' || lpad(v_numero::text, 6, '0'),
		v_numero,
		v_cai.cai,
		v_cai.fecha_limite;
end;
$$;
revoke all on function public.numero_siguiente_factura(bigint) from public, anon;
grant execute on function public.numero_siguiente_factura(bigint) to authenticated;

-- ------------------------------------------------------------
-- 5. RPC: validar CAI (estado y alertas)
-- ------------------------------------------------------------
drop function if exists public.validar_cai(bigint);
create or replace function public.validar_cai(p_cai_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cai public.configuracion_cai;
	v_disponibles bigint;
	v_dias_restantes int;
begin
	if auth.uid() is null or not public.usuario_tiene_rol(array['admin', 'supervisor', 'caja', 'vendedor', 'reception']) then
		raise exception 'Usuario no autorizado' using errcode = '42501';
	end if;

	select * into v_cai from public.configuracion_cai where id = p_cai_id;
	if v_cai.id is null then
		return jsonb_build_object('valido', false, 'mensaje', 'CAI no encontrado');
	end if;

	if current_date > v_cai.fecha_limite then
		return jsonb_build_object('valido', false, 'mensaje', 'CAI expirado el ' || v_cai.fecha_limite::text);
	end if;

	v_disponibles := v_cai.correlativo_hasta - v_cai.correlativo_actual;
	v_dias_restantes := v_cai.fecha_limite - current_date;

	return jsonb_build_object(
		'valido', true,
		'cai', v_cai.cai,
		'negocio', v_cai.negocio,
		'direccion', v_cai.direccion,
		'telefono', v_cai.telefono,
		'rtn_emisor', v_cai.rtn_emisor,
		'pie_factura', v_cai.pie_factura,
		'disponibles', v_disponibles,
		'dias_restantes', v_dias_restantes,
		'alerta_bajo', v_disponibles < 20,
		'alerta_critico', v_disponibles < 5,
		'alerta_fecha', v_dias_restantes < 30
	);
end;
$$;
revoke all on function public.validar_cai(bigint) from public, anon;
grant execute on function public.validar_cai(bigint) to authenticated;

-- ------------------------------------------------------------
-- 6. RPC: guardar / actualizar CAI
-- ------------------------------------------------------------
drop function if exists public.guardar_cai(text, text, text, text, text, bigint, bigint, date, text, text, text, text, boolean, bigint);
create or replace function public.guardar_cai(
	p_cai text,
	p_rtn_emisor text,
	p_establecimiento text default '001',
	p_punto_emision text default '001',
	p_tipo_documento text default '01',
	p_correlativo_desde bigint default 1,
	p_correlativo_hasta bigint default 500,
	p_fecha_limite date default (current_date + interval '6 months')::date,
	p_negocio text default 'WS Abarrotes',
	p_direccion text default '',
	p_telefono text default '',
	p_pie_factura text default '¡Gracias por su compra!',
	p_activo boolean default true,
	p_id bigint default null
)
returns public.configuracion_cai
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_cai public.configuracion_cai;
	v_rtn text := regexp_replace(coalesce(p_rtn_emisor, ''), '[^0-9]', '', 'g');
	v_establecimiento text := coalesce(nullif(btrim(p_establecimiento), ''), '001');
	v_punto_emision text := coalesce(nullif(btrim(p_punto_emision), ''), '001');
	v_tipo text := coalesce(nullif(btrim(p_tipo_documento), ''), '01');
	v_desde bigint := coalesce(p_correlativo_desde, 1);
	v_hasta bigint := coalesce(p_correlativo_hasta, 100);
	v_actual bigint;
begin
	if auth.uid() is null or not public.usuario_tiene_rol(array['admin', 'supervisor']) then
		raise exception 'Se requiere rol de administrador o supervisor' using errcode = '42501';
	end if;
	if length(btrim(coalesce(p_cai, ''))) = 0 then
		raise exception 'El CAI es obligatorio';
	end if;
	if length(v_rtn) <> 14 then
		raise exception 'El RTN del emisor debe tener 14 dígitos';
	end if;
	if v_desde < 1 or v_hasta < v_desde then
		raise exception 'El rango de correlativos no es válido';
	end if;
	if p_fecha_limite < current_date then
		raise exception 'La fecha límite no puede ser anterior a hoy';
	end if;
	if v_tipo not in ('01', '02') then
		raise exception 'Tipo de documento no válido';
	end if;

	if coalesce(p_activo, true) then
		update public.configuracion_cai set activo = false where activo = true and id is distinct from p_id;
	end if;

	if p_id is null then
		if exists (select 1 from public.configuracion_cai where cai = btrim(p_cai)) then
			raise exception 'Ya existe un CAI con ese código';
		end if;
		insert into public.configuracion_cai (
			cai, rtn_emisor, establecimiento, punto_emision, tipo_documento,
			correlativo_desde, correlativo_hasta, correlativo_actual, fecha_limite,
			negocio, direccion, telefono, pie_factura, activo, creado_por
		) values (
			btrim(p_cai), v_rtn, v_establecimiento, v_punto_emision, v_tipo,
			v_desde, v_hasta, v_desde - 1, p_fecha_limite,
			coalesce(nullif(btrim(p_negocio), ''), 'WS Abarrotes'),
			coalesce(p_direccion, ''), coalesce(p_telefono, ''), coalesce(p_pie_factura, ''),
			coalesce(p_activo, true), auth.uid()
		) returning * into v_cai;
	else
		select correlativo_actual into v_actual from public.configuracion_cai where id = p_id;
		update public.configuracion_cai set
			cai = btrim(p_cai),
			rtn_emisor = v_rtn,
			establecimiento = v_establecimiento,
			punto_emision = v_punto_emision,
			tipo_documento = v_tipo,
			correlativo_desde = v_desde,
			correlativo_hasta = v_hasta,
			correlativo_actual = least(greatest(coalesce(v_actual, v_desde - 1), v_desde - 1), v_hasta),
			fecha_limite = p_fecha_limite,
			negocio = coalesce(nullif(btrim(p_negocio), ''), negocio),
			direccion = coalesce(p_direccion, direccion),
			telefono = coalesce(p_telefono, telefono),
			pie_factura = coalesce(nullif(btrim(p_pie_factura), ''), pie_factura),
			activo = coalesce(p_activo, activo)
		where id = p_id returning * into v_cai;
		if v_cai.id is null then raise exception 'CAI no encontrado'; end if;
	end if;

	return v_cai;
end;
$$;
revoke all on function public.guardar_cai(text, text, text, text, text, bigint, bigint, date, text, text, text, text, boolean, bigint) from public, anon;
grant execute on function public.guardar_cai(text, text, text, text, text, bigint, bigint, date, text, text, text, text, boolean, bigint) to authenticated;

-- ------------------------------------------------------------
-- 7. Integrar CAI en crear_venta (generar número de factura)
-- ------------------------------------------------------------
drop function if exists public.crear_venta(bigint, text, jsonb, numeric, text, numeric, text, text, text, uuid, text, bigint, text, bigint);
drop function if exists public.crear_venta(bigint, text, jsonb, numeric, text, numeric, text, text, text, uuid, text);
create or replace function public.crear_venta(
	p_cliente_id bigint default null,
	p_cliente_nombre text default 'Consumidor Final',
	p_items jsonb default '[]'::jsonb,
	p_descuento numeric default 0,
	p_metodo_pago text default 'Efectivo',
	p_monto_recibido numeric default 0,
	p_nota text default '',
	p_tipo_documento text default 'Factura',
	p_cliente_rtn text default '',
	p_vendedor_id uuid default null,
	p_banco text default '',
	p_cai_id bigint default null,
	p_numero_factura text default '',
	p_correlativo bigint default null
)
returns public.ventas
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_sale public.ventas;
	v_item record;
	v_product public.productos;
	v_numero bigint;
	v_subtotal numeric(12, 2) := 0;
	v_line_subtotal numeric(12, 2);
	v_line_tax numeric(12, 2);
	v_tax_total numeric(12, 2) := 0;
	v_base_gravada numeric(12, 2) := 0;
	v_descuento numeric(12, 2);
	v_total numeric(12, 2);
	v_recibido numeric(12, 2);
	v_cambio numeric(12, 2) := 0;
	v_cliente_id bigint := p_cliente_id;
	v_cliente_nombre text;
	v_cliente_rtn text := regexp_replace(coalesce(p_cliente_rtn, ''), '[^0-9]', '', 'g');
	v_tipo_documento text := coalesce(nullif(btrim(p_tipo_documento), ''), 'Factura');
	v_cantidad numeric(12, 3);
	v_stock_anterior numeric(12, 3);
	v_stock_nuevo numeric(12, 3);
	v_vendedor_id uuid := auth.uid();
	v_vendedor_nombre text := '';
	v_banco text := btrim(coalesce(p_banco, ''));
	v_cai_id bigint := p_cai_id;
	v_numero_factura text := coalesce(p_numero_factura, '');
	v_correlativo bigint := p_correlativo;
begin
	if auth.uid() is null or not public.usuario_tiene_rol(array['admin', 'supervisor', 'caja', 'vendedor', 'reception']) then
		raise exception 'Usuario no autorizado' using errcode = '42501';
	end if;
	if p_metodo_pago is null or p_metodo_pago not in ('Efectivo', 'Tarjeta', 'Transferencia') then
		raise exception 'Método de pago no válido';
	end if;
	if v_tipo_documento not in ('Factura', 'Recibo') then
		raise exception 'Tipo de documento no válido';
	end if;
	if p_metodo_pago = 'Tarjeta' and v_banco = '' then
		raise exception 'Selecciona el banco o terminal POS del cobro con tarjeta';
	end if;
	if v_cliente_rtn <> '' and length(v_cliente_rtn) <> 14 then
		raise exception 'El RTN del cliente debe tener 14 dígitos';
	end if;
	if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
		raise exception 'La venta no tiene productos';
	end if;

	if p_vendedor_id is not null and public.usuario_tiene_rol(array['admin', 'supervisor']) then
		v_vendedor_id := p_vendedor_id;
	end if;
	select coalesce(authorized.username, split_part(users.email, '@', 1))
	into v_vendedor_nombre
	from auth.users as users
	left join private.allowed_users as authorized on authorized.email = lower(users.email)
	where users.id = v_vendedor_id;
	v_vendedor_nombre := coalesce(nullif(btrim(coalesce(v_vendedor_nombre, '')), ''), 'Usuario POS');

	v_cliente_nombre := coalesce(nullif(btrim(coalesce(p_cliente_nombre, '')), ''), 'Consumidor Final');
	if v_cliente_id is not null then
		select nombre, rtn into v_cliente_nombre, v_cliente_rtn
		from public.clientes where id = v_cliente_id;
		if v_cliente_nombre is null then
			v_cliente_id := null;
			v_cliente_nombre := coalesce(nullif(btrim(coalesce(p_cliente_nombre, '')), ''), 'Consumidor Final');
		end if;
	end if;
	if v_tipo_documento = 'Factura' and (v_cliente_id is null or v_cliente_rtn = '') then
		raise exception 'La factura comercial requiere un cliente registrado con RTN';
	end if;

	update private.sale_counter
	set last_number = last_number + 1
	where counter_name = 'main'
	returning last_number into v_numero;
	if v_numero is null then
		raise exception 'No se encontró el contador de ventas';
	end if;

	insert into public.ventas (
		numero_venta, cliente_id, cliente_nombre, metodo_pago, creado_por,
		cai_id, numero_factura, correlativo, vendedor_id, vendedor_nombre, banco
	) values (
		v_numero, v_cliente_id, v_cliente_nombre, p_metodo_pago, auth.uid(),
		v_cai_id, v_numero_factura, v_correlativo, v_vendedor_id, v_vendedor_nombre,
		case when p_metodo_pago = 'Tarjeta' then v_banco else '' end
	) returning * into v_sale;

	for v_item in
		select * from jsonb_to_recordset(p_items) as x(producto_id bigint, cantidad numeric)
	loop
		if v_item.producto_id is null then
			raise exception 'Hay un producto inválido en la venta';
		end if;
		v_cantidad := round(coalesce(v_item.cantidad, 0), 3);
		if v_cantidad <= 0 then
			raise exception 'La cantidad de cada producto debe ser mayor a cero';
		end if;

		select * into v_product
		from public.productos
		where id = v_item.producto_id
		for update;
		if not found then
			raise exception 'Producto no encontrado (ID %)', v_item.producto_id;
		end if;
		if not v_product.activo then
			raise exception 'El producto "%" está inactivo', v_product.nombre;
		end if;
		if v_product.stock < v_cantidad then
			raise exception 'Stock insuficiente para "%": disponible %, solicitado %',
				v_product.nombre, v_product.stock, v_cantidad;
		end if;

		v_line_subtotal := round(v_product.precio * v_cantidad, 2);
		v_subtotal := v_subtotal + v_line_subtotal;
		v_line_tax := round(
			v_line_subtotal - (v_line_subtotal / (1 + (v_product.impuesto_porcentaje / 100.0))),
			2
		);
		v_tax_total := v_tax_total + v_line_tax;
		v_stock_anterior := v_product.stock;
		v_stock_nuevo := v_product.stock - v_cantidad;

		insert into public.venta_detalle (
			venta_id, producto_id, codigo, nombre, unidad, cantidad,
			precio_unitario, costo_unitario, impuesto_porcentaje, impuesto_monto,
			descuento, subtotal
		) values (
			v_sale.id, v_product.id, v_product.codigo, v_product.nombre, v_product.unidad,
			v_cantidad, v_product.precio, v_product.costo,
			v_product.impuesto_porcentaje, v_line_tax, 0, v_line_subtotal
		);

		update public.productos
		set stock = v_stock_nuevo, actualizado_en = now()
		where id = v_product.id;

		insert into public.movimientos_inventario (
			producto_id, tipo, cantidad, stock_anterior, stock_nuevo,
			referencia, nota, creado_por
		) values (
			v_product.id, 'Venta', -v_cantidad, v_stock_anterior, v_stock_nuevo,
			'Venta #' || v_numero, '', auth.uid()
		);
	end loop;

	if v_descuento > v_subtotal then
		raise exception 'El descuento no puede superar el subtotal';
	end if;
	v_total := round(v_subtotal - v_descuento, 2);
	if v_subtotal > 0 then
		v_tax_total := round(v_tax_total * (v_total / v_subtotal), 2);
	else
		v_tax_total := 0;
	end if;
	v_tax_total := least(greatest(v_tax_total, 0), v_total);
	v_base_gravada := round(v_total - v_tax_total, 2);

	if p_metodo_pago = 'Efectivo' then
		v_recibido := round(coalesce(p_monto_recibido, 0), 2);
		if v_recibido < v_total then
			raise exception 'El efectivo recibido (%) es menor al total (%)', v_recibido, v_total;
		end if;
		v_cambio := round(v_recibido - v_total, 2);
	else
		v_recibido := v_total;
		v_cambio := 0;
	end if;

	update public.ventas set
		cliente_id = v_cliente_id,
		cliente_nombre = v_cliente_nombre,
		cliente_rtn = v_cliente_rtn,
		tipo_documento = v_tipo_documento,
		cai_id = v_cai_id,
		numero_factura = v_numero_factura,
		correlativo = v_correlativo,
		vendedor_id = v_vendedor_id,
		vendedor_nombre = v_vendedor_nombre,
		banco = case when p_metodo_pago = 'Tarjeta' then v_banco else '' end,
		subtotal = v_subtotal,
		descuento = v_descuento,
		impuesto = v_tax_total,
		base_gravada = v_base_gravada,
		total = v_total,
		monto_recibido = v_recibido,
		cambio = v_cambio,
		nota = coalesce(p_nota, '')
	where id = v_sale.id
	returning * into v_sale;

	return v_sale;
end;
$$;
revoke all on function public.crear_venta(bigint, text, jsonb, numeric, text, numeric, text, text, text, uuid, text, bigint, text, bigint) from public, anon;
grant execute on function public.crear_venta(bigint, text, jsonb, numeric, text, numeric, text, text, text, uuid, text, bigint, text, bigint) to authenticated;

-- ------------------------------------------------------------
-- 8. RLS para configuracion_cai (ya creada arriba)
-- ------------------------------------------------------------

-- Recarga la caché de PostgREST para que las nuevas tablas/RPC estén disponibles.
notify pgrst, 'reload schema';