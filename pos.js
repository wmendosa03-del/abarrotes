/* ============================================================
   WS Services Â· MÃ³dulo de Punto de Venta
   Requiere que Recibo.html exponga window.WSApp.
   ============================================================ */
'use strict';

(() => {
	const ws = () => window.WSApp || {};
	const $ = id => document.getElementById(id);
	const round2 = value => Math.round((Number(value) || 0) * 100) / 100;
	const round3 = value => Math.round((Number(value) || 0) * 1000) / 1000;
	const padSale = value => String(value || '').padStart(6, '0');
	const DEFAULT_TAX = 15;
	const SETTINGS_KEY = 'ws-abarrotes-settings-v1';
	const DEFAULT_SETTINGS = {
		negocio: 'WS Abarrotes',
		rtn: '',
		direccion: '',
		telefono: '',
		correo: '',
		pie: 'Â¡Gracias por su compra!',
		isv: DEFAULT_TAX,
		stockMinimo: 5,
		moneda: 'L.'
	};

	const state = {
		products: [],
		productsLoaded: false,
		loadingProducts: false,
		categories: [],
		category: 'Todos',
		cart: new Map(),
		payment: 'Efectivo',
		documentType: 'Factura',
		discount: 0,
		total: 0,
		busy: false,
		todaySales: [],
		sales: [],
		salesLoaded: false,
		loadingSales: false,
		salesDatesInitialized: false,
		setupMissing: false,
		productsReady: false,
		salesReady: false,
		editingProductId: null,
		currentTicketHtml: '',
		currentTicketTitle: 'Factura de venta',
		customers: [],
		customersLoaded: false,
		loadingCustomers: false,
		editingCustomerId: null,
		productPhoto: { file: null, url: '', changed: false, preview: '' },
		inventory: [],
		inventoryLoaded: false,
		loadingInventory: false,
		reports: null,
		reportsLoaded: false,
		loadingReports: false,
		reportsDatesInitialized: false,
		sellers: [],
		cai: null,
		sellersLoaded: false,
		suppliers: [],
		suppliersLoaded: false,
		loadingSuppliers: false,
		editingSupplierId: null,
		purchases: [],
		purchaseDetails: [],
		purchasesLoaded: false,
		loadingPurchases: false,
		purchaseItems: [],
		cash: [],
		cashLoaded: false,
		cashReady: false,
		currentCash: null,
		users: [],
		usersLoaded: false,
		settings: loadSettings()
	};

	function loadSettings() {
		try {
			const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
			return { ...DEFAULT_SETTINGS, ...saved };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}
	function persistSettings(settings) {
		state.settings = { ...DEFAULT_SETTINGS, ...settings };
		try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
	}
	async function loadActiveCai() {
		const database = getDb();
		if (!database) return null;
		try {
			const { data, error } = await database
				.from('configuracion_cai')
				.select('*')
				.eq('activo', true)
				.order('creado_en', { ascending: false })
				.limit(1);
			if (error || !data || !data.length) {
				state.cai = null;
				return null;
			}
			state.cai = data[0];
			return state.cai;
		} catch {
			state.cai = null;
			return null;
		}
	}
	function numeroALetras(amount) {
		const integer = Math.round(Number(amount || 0));
		if (!Number.isFinite(integer) || integer < 0) return 'Cero';
		if (integer === 0) return 'Cero';
		const unidades = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
		const decenas = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
		const centenas = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
		const especiales = {
			11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
			16: 'diecisÃ©is', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
			21: 'veintiuno', 22: 'veintidÃ³s', 23: 'veintitrÃ©s', 24: 'veinticuatro',
			25: 'veinticinco', 26: 'veintisÃ©is', 27: 'veintisiete', 28: 'veintiocho',
			29: 'veintinueve'
		};
		function convert(n) {
			if (n === 0) return '';
			if (n < 10) return unidades[n];
			if (n < 20) {
				if (especiales[n]) return especiales[n];
				return decenas[Math.floor(n / 10)] + (n % 10 ? ' y ' + unidades[n % 10] : '');
			}
			if (n < 100) {
				const d = Math.floor(n / 10);
				const u = n % 10;
				return decenas[d] + (u ? ' y ' + unidades[u] : '');
			}
			if (n === 100) return 'cien';
			if (n < 1000) {
				const c = Math.floor(n / 100);
				const r = n % 100;
				return centenas[c] + (r ? ' ' + convert(r) : '');
			}
			if (n < 1000000) {
				const miles = Math.floor(n / 1000);
				const r = n % 1000;
				return (miles === 1 ? 'mil' : convert(miles) + ' mil') + (r ? ' ' + convert(r) : '');
			}
			const millones = Math.floor(n / 1000000);
			const r = n % 1000000;
			return (millones === 1 ? 'un millÃ³n' : convert(millones) + ' millones') + (r ? ' ' + convert(r) : '');
		}
		const words = convert(integer);
		return words.charAt(0).toUpperCase() + words.slice(1) + ' Lempiras';
	}
	function normalizeRtn(value) {
		return String(value ?? '').replace(/[^0-9]/g, '').slice(0, 14);
	}
	function documentTypeOf(sale) {
		return sale?.tipo_documento === 'Recibo' ? 'Recibo' : 'Factura';
	}
	function documentLabel(sale) {
		return documentTypeOf(sale) === 'Recibo' ? 'Recibo' : 'Factura';
	}

	/* â”€â”€ Utilidades â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function notify(message, variant) {
		if (typeof ws().notify === 'function') ws().notify(message, variant);
	}
	function money(value) {
		const symbol = state.settings?.moneda || 'L.';
		return `${symbol} ${Number(value || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	}
	function moneyWhole(value) {
		const symbol = state.settings?.moneda || 'L.';
		return `${symbol} ${Math.round(Number(value || 0)).toLocaleString('es-HN', { maximumFractionDigits: 0 })}`;
	}
	function esc(value) {
		return typeof ws().escapeHtml === 'function' ? ws().escapeHtml(value) : String(value ?? '');
	}
	function normalize(value) {
		return typeof ws().normalizeKey === 'function' ? ws().normalizeKey(value) : String(value ?? '').trim().toLowerCase();
	}
	function today() {
		return typeof ws().today === 'function' ? ws().today() : new Date().toISOString().slice(0, 10);
	}
	function setView(name) {
		if (typeof ws().setView === 'function') ws().setView(name);
	}
	function isPosRole() {
		return ['admin', 'supervisor', 'caja', 'vendedor', 'reception'].includes(ws().activeUserRole);
	}
	function isSupervisorRole() {
		return ['admin', 'supervisor'].includes(ws().activeUserRole);
	}
	function isCashRole() {
		return ['admin', 'supervisor', 'caja', 'reception'].includes(ws().activeUserRole);
	}
	function roleLabel(role) {
		const labels = {
			admin: 'Administrador',
			supervisor: 'Supervisor',
			caja: 'Caja',
			vendedor: 'Vendedor',
			reception: 'RecepciÃ³n',
			technician: 'TÃ©cnico',
			viewer: 'Solo consulta'
		};
		return labels[role] || role;
	}
	function getDb() {
		const database = ws().database;
		if (!database) {
			notify('La conexiÃ³n con la base de datos todavÃ­a no estÃ¡ lista.', 'error');
			return null;
		}
		return database;
	}
	async function ensureWritable() {
		const database = getDb();
		if (!database) return null;
		if (typeof ws().ensureActiveSession === 'function') {
			const ok = await ws().ensureActiveSession();
			if (!ok) return null;
		}
		return database;
	}
	function isMissingModule(error) {
		const message = String(error?.message || '').toLowerCase();
		return error?.code === '42P01'
			|| message.includes('does not exist')
			|| message.includes('no existe')
			|| message.includes('schema cache')
			|| message.includes('could not find the table')
			|| message.includes('relation');
	}
	function showSetupBanner() {
		state.setupMissing = true;
		const banner = $('posSetupBanner');
		if (banner) banner.hidden = false;
	}
	function hideSetupIfReady() {
		if (!state.productsReady || !state.salesReady) return;
		state.setupMissing = false;
		const banner = $('posSetupBanner');
		if (banner) banner.hidden = true;
	}
	function setEmpty(target, message) {
		if (target) target.innerHTML = `<p class="empty-note">${esc(message)}</p>`;
	}
	function formatQty(value) {
		const number = Number(value || 0);
		if (!Number.isFinite(number)) return '0';
		return Number.isInteger(number)
			? String(number)
			: number.toLocaleString('es-HN', { maximumFractionDigits: 3 });
	}
	function formatDate(value) {
		if (!value) return '';
		const [year, month, day] = String(value).split('-').map(Number);
		if (!year || !month || !day) return '';
		return new Date(year, month - 1, day).toLocaleDateString('es-HN');
	}
	function formatDateTime(value) {
		if (!value) return '';
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return String(value);
		return parsed.toLocaleString('es-HN', {
			day: '2-digit', month: '2-digit', year: 'numeric',
			hour: '2-digit', minute: '2-digit'
		});
	}
	function localDateKey(value) {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return String(value || '').slice(0, 10);
		return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
	}
	function taxRate(product) {
		const rate = Number(product?.impuesto_porcentaje);
		return Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : DEFAULT_TAX;
	}
	function priceWithoutTax(product) {
		const rate = taxRate(product) / 100;
		const price = Number(product?.precio || 0);
		return round2(rate > 0 ? price / (1 + rate) : price);
	}
	function cartTaxBreakdown(subtotal, discount) {
		let included = 0;
		state.cart.forEach(({ product, qty }) => {
			const gross = round2(Number(product.precio || 0) * Number(qty || 0));
			const rate = taxRate(product) / 100;
			if (rate > 0) included += gross - (gross / (1 + rate));
		});
		const total = round2(Math.max(0, subtotal - discount));
		const factor = subtotal > 0 ? total / subtotal : 0;
		const tax = round2(Math.max(0, Math.min(total, included * factor)));
		return { tax, base: round2(total - tax), total };
	}
	function normalizeProduct(row) {
		return {
			...row,
			id: Number(row.id),
			precio: Number(row.precio || 0),
			costo: Number(row.costo || 0),
			impuesto_porcentaje: Number(row.impuesto_porcentaje ?? DEFAULT_TAX),
			stock: Number(row.stock || 0),
			stock_minimo: Number(row.stock_minimo || 0),
			activo: row.activo !== false,
			foto_url: row.foto_url || ''
		};
	}
	function normalizeSale(row) {
		return {
			...row,
			id: Number(row.id),
			numero_venta: Number(row.numero_venta || 0),
			subtotal: Number(row.subtotal || 0),
			descuento: Number(row.descuento || 0),
			impuesto: Number(row.impuesto || 0),
			base_gravada: Number(row.base_gravada || 0),
			total: Number(row.total || 0),
			tipo_documento: row.tipo_documento === 'Recibo' ? 'Recibo' : 'Factura',
			cliente_rtn: normalizeRtn(row.cliente_rtn || ''),
			vendedor_nombre: row.vendedor_nombre || '',
			banco: row.banco || '',
			monto_recibido: Number(row.monto_recibido || 0),
			cambio: Number(row.cambio || 0)
		};
	}

	/* â”€â”€ Productos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadProducts(force = false) {
		if (state.loadingProducts) return state.products;
		if (state.productsLoaded && !force) return state.products;
		const database = getDb();
		if (!database) return state.products;
		state.loadingProducts = true;
		try {
			const { data, error } = await database.from('productos').select('*').order('nombre');
			if (error) {
				if (isMissingModule(error)) {
					state.productsReady = false;
					showSetupBanner();
					state.products = [];
					state.productsLoaded = false;
					state.categories = [];
					return state.products;
				}
				notify(error.message || 'No se pudo consultar el catÃ¡logo.', 'error');
				return state.products;
			}
			state.products = (data || []).map(normalizeProduct);
			state.productsLoaded = true;
			state.productsReady = true;
			hideSetupIfReady();
			state.categories = [...new Set(state.products.map(product => product.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
			if (state.category !== 'Todos' && !state.categories.includes(state.category)) state.category = 'Todos';
			renderCategoryOptions();
			renderCategories();
			renderPOSProducts();
			renderProductList();
			return state.products;
		} finally {
			state.loadingProducts = false;
		}
	}

	function renderCategoryOptions() {
		const datalist = $('productCategoryOptions');
		if (!datalist) return;
		datalist.replaceChildren();
		state.categories.forEach(category => {
			const option = document.createElement('option');
			option.value = category;
			datalist.appendChild(option);
		});
	}

	function renderCategories() {
		const container = $('posCategories');
		if (!container) return;
		const active = state.products.filter(product => product.activo);
		const counts = new Map();
		active.forEach(product => counts.set(product.categoria || 'General', (counts.get(product.categoria || 'General') || 0) + 1));
		const categories = ['Todos', ...state.categories];
		container.replaceChildren();
		categories.forEach(category => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = `pos-category${state.category === category ? ' active' : ''}`;
			button.dataset.posCategory = category;
			button.textContent = category === 'Todos' ? `Todos (${active.length})` : `${category} (${counts.get(category) || 0})`;
			container.appendChild(button);
		});
	}

	function filteredProducts() {
		const term = normalize($('posSearch')?.value || '');
		return state.products
			.filter(product => product.activo)
			.filter(product => state.category === 'Todos' || product.categoria === state.category)
			.filter(product => {
				if (!term) return true;
				return normalize([product.nombre, product.codigo, product.categoria, product.unidad].join(' ')).includes(term);
			})
			.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
	}

	function renderPOSProducts() {
		const grid = $('posGrid');
		if (!grid) return;
		const products = filteredProducts();
		if (!products.length) {
			grid.innerHTML = `
				<div class="pos-empty">
					<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16l-1.5 13H5.5z"/><path d="M8 7V5a4 4 0 0 1 8 0v2"/></svg></div>
					<p>${state.setupMissing ? 'El mÃ³dulo de productos todavÃ­a no estÃ¡ activo.' : 'No hay productos que coincidan con la bÃºsqueda.'}</p>
					<button class="button primary" type="button" data-pos-action="new-product">Agregar producto</button>
				</div>`;
			return;
		}
		grid.innerHTML = products.map(product => {
			const empty = product.stock <= 0;
			const low = !empty && product.stock <= product.stock_minimo;
			return `
				<button class="pos-product-card${empty ? ' out-of-stock' : ''}" type="button" data-pos-product="${product.id}" ${empty ? 'disabled' : ''} title="${esc(product.nombre)}">
					${product.foto_url ? `<img class="product-thumb" src="${esc(product.foto_url)}" alt="" loading="lazy">` : '<span class="product-thumb product-thumb-empty" aria-hidden="true"></span>'}
					<span class="product-name">${esc(product.nombre)}</span>
					<span class="product-code">${product.codigo ? esc(product.codigo) : 'Sin cÃ³digo'}</span>
					<span class="product-price">${moneyWhole(product.precio)}</span>
					<span class="product-meta">
						<span class="product-stock${empty ? ' empty' : low ? ' low' : ''}">${empty ? 'Sin stock' : `Stock: ${formatQty(product.stock)}`}</span>
						<span class="product-category">${esc(product.categoria || 'General')}</span>
					</span>
				</button>`;
		}).join('');
	}

	/* â”€â”€ Carrito â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function cartSubtotal() {
		let subtotal = 0;
		state.cart.forEach(({ product, qty }) => {
			subtotal += product.precio * qty;
		});
		return round2(subtotal);
	}
	function cartCount() {
		let count = 0;
		state.cart.forEach(({ qty }) => { count += Number(qty) || 0; });
		return round3(count);
	}
	function productStep(product) {
		return ['Unidad', 'Servicio', 'Caja', 'Paquete', 'Docena'].includes(product.unidad) ? 1 : 0.25;
	}
	function addToCart(productId) {
		const product = state.products.find(item => Number(item.id) === Number(productId));
		if (!product) return;
		if (!product.activo) {
			notify('Ese producto estÃ¡ inactivo.', 'error');
			return;
		}
		if (product.stock <= 0) {
			notify('Ese producto no tiene stock disponible.', 'error');
			return;
		}
		const key = String(product.id);
		const current = state.cart.get(key);
		const nextQty = round3((current?.qty || 0) + 1);
		if (nextQty > product.stock) {
			notify(`Solo hay ${formatQty(product.stock)} ${product.unidad || 'unidades'} de "${product.nombre}".`, 'error');
			return;
		}
		state.cart.set(key, { product, qty: nextQty });
		renderCart();
	}
	function changeQty(productId, nextValue) {
		const key = String(productId);
		const item = state.cart.get(key);
		if (!item) return;
		let qty = round3(Number(nextValue));
		if (!Number.isFinite(qty) || qty <= 0) {
			state.cart.delete(key);
			renderCart();
			return;
		}
		if (qty > item.product.stock) {
			notify(`Solo hay ${formatQty(item.product.stock)} ${item.product.unidad || 'unidades'} disponibles.`, 'error');
			qty = item.product.stock;
		}
		if (qty <= 0) {
			state.cart.delete(key);
			renderCart();
			return;
		}
		item.qty = qty;
		state.cart.set(key, item);
		renderCart();
	}
	function removeFromCart(productId) {
		state.cart.delete(String(productId));
		renderCart();
	}
	function clearCart() {
		state.cart.clear();
		state.discount = 0;
		const discountInput = $('posDiscount');
		const cashInput = $('posCashReceived');
		const noteInput = $('posNote');
		const customer = $('posCustomer');
		if (discountInput) discountInput.value = '';
		if (cashInput) cashInput.value = '';
		if (noteInput) noteInput.value = '';
		if (customer) customer.value = '';
		renderCart();
	}
	function renderCart() {
		const container = $('posCartItems');
		if (!container) return;
		if (!state.cart.size) {
			container.innerHTML = '<p class="pos-cart-empty">Agrega productos del catÃ¡logo para comenzar la venta.</p>';
		} else {
			container.innerHTML = [...state.cart.values()].map(({ product, qty }) => `
				<div class="pos-cart-item" data-cart-item="${product.id}">
					<div class="cart-item-name" title="${esc(product.nombre)}">${esc(product.nombre)}</div>
					<div class="cart-item-price">${moneyWhole(product.precio)} / ${esc(product.unidad || 'Unidad')}</div>
					<div class="cart-item-controls">
						<button class="qty-button" type="button" data-cart-minus="${product.id}" aria-label="Quitar uno">âˆ’</button>
						<input class="qty-input" data-cart-qty="${product.id}" type="number" min="0.001" step="0.001" value="${qty}" aria-label="Cantidad de ${esc(product.nombre)}">
						<button class="qty-button" type="button" data-cart-plus="${product.id}" aria-label="Agregar uno">+</button>
						<button class="cart-remove" type="button" data-cart-remove="${product.id}" aria-label="Quitar producto">Ã—</button>
						<span class="cart-item-subtotal">${moneyWhole(product.precio * qty)}</span>
					</div>
				</div>`).join('');
		}
		const count = cartCount();
		const countLabel = $('posCartCount');
		if (countLabel) countLabel.textContent = `${formatQty(count)} artÃ­culo${count === 1 ? '' : 's'}`;
		updateTotals();
	}
	function updateTotals() {
		const subtotal = cartSubtotal();
		const discountInput = $('posDiscount');
		const cashInput = $('posCashReceived');
		const totalLabel = $('posTotal');
		const subtotalLabel = $('posSubtotal');
		const changeLabel = $('posChange');
		const changeBox = $('posChangeBox');
		const chargeButton = $('posChargeButton');
		if (!totalLabel) return;

		let discount = discountInput ? Number(discountInput.value || 0) : 0;
		if (!Number.isFinite(discount)) discount = 0;
		discount = round2(Math.max(0, Math.min(discount, subtotal)));
		state.discount = discount;
		if (discountInput && document.activeElement !== discountInput) {
			discountInput.value = discount > 0 ? discount.toFixed(2) : '';
		}
		const total = round2(Math.max(0, subtotal - discount));
		const tax = cartTaxBreakdown(subtotal, discount);
		state.total = total;
		subtotalLabel.textContent = money(subtotal);
		totalLabel.textContent = money(total);
		const taxLabel = $('posTaxIncluded');
		const baseLabel = $('posTaxBase');
		const rateLabel = $('posTaxRate');
		if (taxLabel) taxLabel.textContent = money(tax.tax);
		if (baseLabel) baseLabel.textContent = money(tax.base);
		if (rateLabel) {
			const rates = [...new Set([...state.cart.values()].map(({ product }) => taxRate(product)))];
			rateLabel.textContent = !state.cart.size
				? `ISV ${formatQty(Number(state.settings.isv ?? DEFAULT_TAX))}% incluido`
				: rates.length === 1 ? `ISV ${formatQty(rates[0])}% incluido` : 'ISV incluido';
		}

		let received = cashInput ? Number(String(cashInput.value || '0').replace(',', '.')) : 0;
		if (!Number.isFinite(received)) received = 0;
		if (!state.cart.size) {
			received = 0;
			if (cashInput) cashInput.value = '';
		} else if (state.payment !== 'Efectivo') {
			received = total;
			if (cashInput) cashInput.value = total > 0 ? total.toFixed(2) : '';
		} else if (cashInput && cashInput.value === '') {
			received = total;
			cashInput.value = total > 0 ? total.toFixed(2) : '';
		}
		const change = round2(received - total);
		if (changeBox) changeBox.classList.toggle('negative', change < -0.001);
		if (changeLabel) changeLabel.textContent = change < 0 ? `- ${money(Math.abs(change))}` : money(change);
		if (chargeButton) {
			const insufficientCash = state.payment === 'Efectivo' && received < total - 0.001;
			chargeButton.disabled = state.busy || state.cart.size === 0 || insufficientCash;
			chargeButton.textContent = total > 0 ? `Cobrar ${money(total)}` : 'Cobrar venta';
		}
	}
	function setPayment(method) {
		if (!['Efectivo', 'Tarjeta', 'Transferencia'].includes(method)) return;
		state.payment = method;
		document.querySelectorAll('[data-pos-payment]').forEach(button => {
			button.classList.toggle('active', button.dataset.posPayment === method);
		});
		const cashRow = $('posCashRow');
		if (cashRow) cashRow.hidden = method !== 'Efectivo';
		const bankRow = $('posBankRow');
		if (bankRow) bankRow.hidden = method !== 'Tarjeta';
		if (method !== 'Tarjeta') {
			const bank = $('posCardBank');
			if (bank) bank.value = '';
		}
		updateTotals();
	}

	/* â”€â”€ Cliente de la venta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function fillPosCustomers() {
		const select = $('posCustomer');
		if (!select) return;
		const current = select.value;
		const clients = Array.isArray(ws().knownClients) ? ws().knownClients : [];
		select.replaceChildren();
		const consumer = document.createElement('option');
		consumer.value = '';
		consumer.textContent = 'Consumidor Final';
		select.appendChild(consumer);
		clients.forEach(client => {
			const option = document.createElement('option');
			option.value = String(client.id);
			option.textContent = client.nombre;
			select.appendChild(option);
		});
		if (current && clients.some(client => String(client.id) === current)) select.value = current;
	}
	function selectedCustomer() {
		const select = $('posCustomer');
		const id = Number(select?.value || 0);
		if (!id) return null;
		const clients = Array.isArray(ws().knownClients) ? ws().knownClients : [];
		return clients.find(client => Number(client.id) === id) || null;
	}
	function selectedCustomerName() {
		const customer = selectedCustomer();
		if (customer) return customer.nombre;
		if (state.documentType === 'Recibo') {
			const free = String($('posCustomerName')?.value || '').trim();
			if (free) return free;
		}
		return 'Consumidor Final';
	}
	function updateCustomerTax() {
		const target = $('posCustomerTax');
		if (!target) return;
		const customer = selectedCustomer();
		const rtn = normalizeRtn(customer?.rtn || '');
		target.textContent = customer ? `RTN: ${rtn || 'sin RTN registrado'}` : 'RTN: â€”';
		target.classList.toggle('missing', state.documentType === 'Factura' && !rtn);
		const editButton = $('posEditClient');
		if (editButton) editButton.hidden = !customer;
		const editRow = $('posRtnEdit');
		if (editRow && editRow.hidden === false) {
			// si cambia de cliente mientras se edita, cancelar la ediciÃ³n
			cancelRtnEdit();
		}
	}
	function cancelRtnEdit() {
		const editRow = $('posRtnEdit');
		if (editRow) editRow.hidden = true;
		const input = $('posRtnInput');
		if (input) input.value = '';
	}
	async function openRtnEdit() {
		const customer = selectedCustomer();
		if (!customer) return;
		openEditClient(customer.id);
	}
	function openEditClient(customerId) {
		const customer = state.customers.find(item => Number(item.id) === Number(customerId))
			|| (ws().knownClients || []).find(item => Number(item.id) === Number(customerId));
		if (!customer) return;
		window.__editingClientId = customer.id;
		const modal = $('quickClientModal');
		if (modal) modal.dataset.editingId = String(customer.id);
		$('quickClientId').value = String(customer.id);
		$('quickClientModalTitle').textContent = 'Editar cliente';
		$('quickClientName').value = customer.nombre || '';
		$('quickClientRtn').value = normalizeRtn(customer.rtn || '');
		$('quickClientPhone').value = customer.telefono || '';
		$('quickClientEmail').value = customer.correo || '';
		$('quickClientIdentity').value = customer.identidad || '';
		$('quickClientAddress').value = customer.direccion || '';
		const submit = document.querySelector('#quickClientForm button[type="submit"]');
		if (submit) submit.textContent = 'Guardar cambios';
		$('quickClientModal').hidden = false;
		$('quickClientName').focus();
	}
	function openQuickClient() {
		window.__editingClientId = null;
		const modal = $('quickClientModal');
		if (modal) delete modal.dataset.editingId;
		$('quickClientId').value = '';
		$('quickClientModalTitle').textContent = 'Registrar cliente';
		['quickClientName', 'quickClientRtn', 'quickClientPhone', 'quickClientEmail', 'quickClientIdentity', 'quickClientAddress'].forEach(id => {
			const field = $(id);
			if (field) field.value = '';
		});
		const submit = document.querySelector('#quickClientForm button[type="submit"]');
		if (submit) submit.textContent = 'Guardar y usar';
		$('quickClientModal').hidden = false;
		$('quickClientName').focus();
	}
	function closeQuickClient() {
		$('quickClientModal').hidden = true;
		['quickClientId', 'quickClientName', 'quickClientRtn', 'quickClientPhone', 'quickClientEmail', 'quickClientIdentity', 'quickClientAddress'].forEach(id => {
			const field = $(id);
			if (field) field.value = '';
		});
		window.__editingClientId = null;
		const modal = $('quickClientModal');
		if (modal) delete modal.dataset.editingId;
	}
	async function saveQuickClient() {
		const form = $('quickClientForm');
		if (!form || !form.reportValidity()) return;
		const name = String($('quickClientName').value || '').trim();
		const rtn = normalizeRtn($('quickClientRtn').value);
		if (!name) {
			notify('Escribe el nombre o la razÃ³n social del cliente.', 'error');
			$('quickClientName').focus();
			return;
		}
		if (rtn && rtn.length !== 14) {
			notify('El RTN debe tener exactamente 14 dÃ­gitos.', 'error');
			$('quickClientRtn').focus();
			return;
		}
		const modal = $('quickClientModal');
		const modalEditingId = modal?.dataset.editingId ? Number(modal.dataset.editingId) : null;
		const titleIsEdit = $('quickClientModalTitle')?.textContent === 'Editar cliente';
		const editing = window.__editingClientId || modalEditingId || ($('quickClientId').value ? Number($('quickClientId').value) : null);
		const isEditing = !!(editing || titleIsEdit);
		const editingId = editing || modalEditingId || (titleIsEdit ? Number($('quickClientId').value) : null);
		const database = await ensureWritable();
		if (!database) return;
		const args = {
			p_nombre: name,
			p_telefono: String($('quickClientPhone').value || '').trim(),
			p_correo: String($('quickClientEmail').value || '').trim(),
			p_identidad: String($('quickClientIdentity').value || '').trim(),
			p_direccion: String($('quickClientAddress').value || '').trim(),
			p_rtn: rtn
		};
		let error;
		if (isEditing) {
			args.p_id = Number(editingId || editing || 0);
			({ error } = await database.rpc('actualizar_cliente', args));
		} else {
			({ error } = await database.rpc('crear_cliente', args));
		}
		if (error) {
			const message = String(error.message || '').toLowerCase();
			if (message.includes('could not find the function') || message.includes('schema cache') || isMissingModule(error)) {
				showSetupBanner();
				notify('Ejecuta la versiÃ³n actualizada de "data base pos.sql" para registrar clientes con RTN.', 'error');
			} else {
				notify(error.message || 'No se pudo guardar el cliente.', 'error');
			}
			return;
		}
		window.__debugSave = { editing, isEditing, title: $('quickClientModalTitle')?.textContent, quickClientId: $('quickClientId').value, windowEditing: window.__editingClientId };
		notify(isEditing ? 'Cliente actualizado.' : `Cliente ${name} registrado.`);
		window.__editingClientId = null;
		if (modal) delete modal.dataset.editingId;
		closeQuickClient();
		state.customersLoaded = false;
		await loadCustomers(true);
		const select = $('posCustomer');
		if (select) {
			if (isEditing && editingId) {
				select.value = String(editingId);
			} else if (isEditing) {
				const updated = state.customers.find(item => item.nombre === name);
				if (updated) select.value = String(updated.id);
			} else {
				const created = state.customers.find(item => item.rtn === rtn && item.nombre === name);
				if (created) select.value = String(created.id);
			}
		}
		updateCustomerTax();
	}
	function cancelRtnEdit() { }
	function updateDocumentTypeUi() {
		document.querySelectorAll('[data-doc-type]').forEach(button => {
			button.classList.toggle('active', button.dataset.docType === state.documentType);
		});
		const hint = $('posDocumentHint');
		if (hint) {
			hint.textContent = state.documentType === 'Factura'
				? 'La factura requiere un cliente registrado con RTN.'
				: 'El recibo admite un nombre libre; el RTN es opcional.';
		}
		const freeRow = $('posCustomerNameRow');
		if (freeRow) freeRow.hidden = state.documentType !== 'Recibo';
		updateCustomerTax();
	}
	function setDocumentType(type) {
		state.documentType = type === 'Recibo' ? 'Recibo' : 'Factura';
		updateDocumentTypeUi();
	}

	/* â”€â”€ Resumen del dÃ­a â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadTodaySummary() {
		const database = getDb();
		if (!database) return;
		const start = new Date(`${today()}T00:00:00`);
		const end = new Date(`${today()}T23:59:59.999`);
		const { data, error } = await database
			.from('ventas')
			.select('id, total, impuesto, metodo_pago, estado')
			.gte('fecha', start.toISOString())
			.lte('fecha', end.toISOString())
			.limit(1000);
		if (error) {
			if (isMissingModule(error)) {
				state.salesReady = false;
				showSetupBanner();
			} else {
				notify(error.message || 'No se pudo consultar el resumen del dÃ­a.', 'error');
			}
			return;
		}
		state.salesReady = true;
		hideSetupIfReady();
		state.todaySales = data || [];
		renderTodaySummary();
	}
	function renderTodaySummary() {
		const target = $('posTodaySummary');
		if (!target) return;
		const completed = state.todaySales.filter(sale => sale.estado !== 'Anulada');
		const total = round2(completed.reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const tax = round2(completed.reduce((sum, sale) => sum + Number(sale.impuesto || 0), 0));
		target.innerHTML = `
			<span class="status-pill"><span class="pos-live-dot"></span>Hoy</span>
			<span class="status-pill green">${completed.length} venta${completed.length === 1 ? '' : 's'}</span>
			<span class="status-pill">${money(total)}</span>
			<span class="status-pill">ISV ${money(tax)}</span>`;
	}

	async function renderPOS() {
		if (!isPosRole() || !$('posView')) return;
		await loadProducts();
		fillPosCustomers();
		renderCategories();
		renderPOSProducts();
		renderCart();
		updateDocumentTypeUi();
		await loadSellers();
		fillSellers();
		if (isCashRole()) {
			await loadCash();
			updateCashBanner();
		}
		await loadTodaySummary();
		await loadActiveCai();
	}

	async function refreshPOS() {
		await loadProducts(true);
		fillPosCustomers();
		renderCategories();
		renderPOSProducts();
		renderCart();
		updateDocumentTypeUi();
		await loadSellers(true);
		fillSellers();
		if (isCashRole()) {
			await loadCash(true);
			updateCashBanner();
		}
		await loadTodaySummary();
		await loadActiveCai();
	}

	/* â”€â”€ Cobrar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function chargeSale() {
		if (state.busy || state.cart.size === 0) return;
		const subtotal = cartSubtotal();
		const discount = round2(Math.min(Math.max(Number($('posDiscount')?.value || 0), 0), subtotal));
		const total = round2(subtotal - discount);
		const payment = state.payment;
		const received = payment === 'Efectivo' ? round2(Number(String($('posCashReceived')?.value || '0').replace(',', '.'))) : total;
		if (payment === 'Efectivo' && received < total - 0.001) {
			notify('El efectivo recibido no cubre el total de la venta.', 'error');
			return;
		}
		const documentType = state.documentType;
		const customer = selectedCustomer();
		const freeName = String($('posCustomerName')?.value || '').trim();
		const customerId = customer ? Number(customer.id) : null;
		const customerName = customer?.nombre || (documentType === 'Recibo' && freeName ? freeName : 'Consumidor Final');
		const customerRtn = normalizeRtn(customer?.rtn || '');
		const banco = payment === 'Tarjeta' ? String($('posCardBank')?.value || '').trim() : '';
		if (payment === 'Tarjeta' && !banco) {
			notify('Selecciona el banco o terminal POS del cobro con tarjeta.', 'error');
			$('posCardBank')?.focus();
			return;
		}
		if (documentType === 'Factura' && !customer) {
			notify('Selecciona un cliente registrado con RTN para emitir factura.', 'error');
			$('posCustomer')?.focus();
			return;
		}
		if (documentType === 'Factura' && !customerRtn) {
			notify('El cliente no tiene RTN. AgrÃ©galo en Clientes o emite un recibo.', 'error');
			setView('customers');
			return;
		}
		if (documentType === 'Factura') {
			if (!state.cai) await loadActiveCai();
			if (!state.cai) {
				notify('No hay CAI activo configurado. AgrÃ©galo en ConfiguraciÃ³n â†’ CAI.', 'error');
				setView('settings');
				return;
			}
			const database = getDb();
			if (database) {
				const { data: validation } = await database.rpc('validar_cai', { p_cai_id: state.cai.id });
				if (validation && validation.valido === false) {
					notify(validation.mensaje || 'El CAI no es vÃ¡lido.', 'error');
					return;
				}
			}
		}
		if (state.cashReady && isCashRole() && !state.currentCash) {
			notify('Abre tu caja para iniciar el dÃ­a antes de registrar la venta.', 'error');
			setView('cash');
			return;
		}
		const note = String($('posNote')?.value || '').trim();
		const items = [...state.cart.values()].map(({ product, qty }) => ({
			producto_id: Number(product.id),
			cantidad: round3(qty)
		}));
		const database = await ensureWritable();
		if (!database) return;

		state.busy = true;
		updateTotals();
		try {
			let caiId = null;
			let numeroFactura = '';
			let correlativo = null;
			if (documentType === 'Factura' && state.cai) {
				const { data: caiData, error: caiError } = await database.rpc('numero_siguiente_factura', {
					p_cai_id: state.cai.id
				});
				if (caiError) throw caiError;
				const caiResult = Array.isArray(caiData) ? caiData[0] : caiData;
				numeroFactura = caiResult?.numero_factura || '';
				correlativo = caiResult?.correlativo || null;
				caiId = state.cai.id;
			}
			const { data, error } = await database.rpc('crear_venta', {
				p_cliente_id: customerId,
				p_cliente_nombre: customerName,
				p_items: items,
				p_descuento: discount,
				p_metodo_pago: payment,
				p_monto_recibido: received,
				p_nota: note,
				p_tipo_documento: documentType,
				p_cliente_rtn: customerRtn,
				p_vendedor_id: selectedSellerId(),
				p_banco: banco,
				p_cai_id: caiId,
				p_numero_factura: numeroFactura,
				p_correlativo: correlativo
			});
			if (error) {
				if (isMissingModule(error)) showSetupBanner();
				notify(error.message || 'No se pudo registrar la venta.', 'error');
				return;
			}
			const sale = Array.isArray(data) ? data[0] : data;
			if (!sale) {
				notify('La venta se guardÃ³, pero no se pudo abrir el ticket.', 'error');
				return;
			}
			notify(`Venta #${padSale(sale.numero_venta)} registrada.`);
			clearCart();
			await loadProducts(true);
			await loadTodaySummary();
			if (!$('salesView').hidden) await loadSales();
			await openSaleTicket(sale.id, sale);
		} catch (error) {
			notify(error.message || 'No se pudo registrar la venta.', 'error');
		} finally {
			state.busy = false;
			updateTotals();
		}
	}

	/* â”€â”€ Inventario: formulario y lista â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function renderProductsView(force = false) {
		if (!isPosRole() || !$('productsView')) return;
		await loadProducts(force);
		renderProductList();
	}

	/* â”€â”€ CÃ³digo de barras (EAN-13) y etiquetas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	const EAN13 = {
		L: ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'],
		G: ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'],
		R: ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'],
		paridad: ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
	};
	function ean13CheckDigit(digits12) {
		let sum = 0;
		for (let i = 0; i < 12; i++) {
			sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3);
		}
		return String((10 - (sum % 10)) % 10);
	}
	function isValidBarcode(code) {
		const value = String(code || '').trim();
		if (!/^\d{13}$/.test(value)) return false;
		return ean13CheckDigit(value.slice(0, 12)) === value[12];
	}
	function generateBarcode() {
		for (let attempt = 0; attempt < 40; attempt++) {
			const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
			const body = `200${random}`;
			const code = body + ean13CheckDigit(body);
			const exists = state.products.some(product => String(product.codigo || '').trim() === code);
			if (!exists) return code;
		}
		return `200${Date.now().toString().slice(-9)}${ean13CheckDigit(String(Date.now()).slice(-9))}`;
	}
	function barcodeSvg(code, options = {}) {
		const value = String(code || '').trim();
		if (!/^\d{13}$/.test(value)) return '';
		const width = options.width || 2;
		const height = options.height || 46;
		const quiet = 11;
		const first = Number(value[0]);
		const parity = EAN13.paridad[first];
		let pattern = '101';
		for (let i = 1; i <= 6; i++) {
			const digit = Number(value[i]);
			pattern += parity[i - 1] === 'L' ? EAN13.L[digit] : EAN13.G[digit];
		}
		pattern += '01010';
		for (let i = 7; i <= 12; i++) {
			pattern += EAN13.R[Number(value[i])];
		}
		pattern += '101';
		const total = quiet + pattern.length + quiet;
		const bars = [];
		let x = 0;
		for (const bit of pattern) {
			if (bit === '1') {
				bars.push(`<rect x="${(quiet + x) * width}" y="0" width="${width}" height="${height}" fill="#000"/>`);
			}
			x += 1;
		}
		const label = `${value[0]} ${value.slice(1, 7)} ${value.slice(7)}`;
		return `<svg class="barcode-svg" viewBox="0 0 ${total * width} ${height + 16}" width="${total * width}" height="${height + 16}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Codigo ${value}">
			${bars.join('')}
			<text x="${(total * width) / 2}" y="${height + 12}" text-anchor="middle" font-family="Consolas, monospace" font-size="11" fill="#000">${esc(label)}</text>
		</svg>`;
	}
	function printProductLabels(products) {
		const list = (products || []).filter(product => product && product.activo !== false);
		if (!list.length) {
			notify('No hay productos para imprimir.', 'error');
			return;
		}
		const styles = `
			@page { size: A4; margin: 8mm; }
			* { box-sizing: border-box; }
			body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #000; }
			.sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
			.label { height: 38mm; padding: 2mm; border: 1px dashed #999; border-radius: 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; }
			.label h3 { margin: 0 0 1mm; font-size: 10.5pt; line-height: 1.2; max-height: 9mm; overflow: hidden; }
			.label .precio { font-size: 12pt; font-weight: 700; margin-bottom: 1mm; }
			.label .barcode-svg { max-width: 100%; height: 20mm; }
			.label .codigo { font-family: Consolas, monospace; font-size: 7.5pt; letter-spacing: .4px; }
			@media print { .label { border-color: #ddd; } }`;
		const cards = list.map(product => {
			const code = String(product.codigo || '').trim();
			return `<div class="label">
				<h3>${esc(product.nombre)}</h3>
				<div class="precio">${moneyWhole(product.precio)}</div>
				${code ? barcodeSvg(code, { width: 2, height: 44 }) : '<div class="codigo">Sin codigo</div>'}
				<div class="codigo">${esc(code || 'SIN CODIGO')}</div>
			</div>`;
		}).join('');
		const win = window.open('', '_blank', 'width=900,height=700');
		if (!win) {
			notify('Permite las ventanas emergentes para imprimir las etiquetas.', 'error');
			return;
		}
		win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas de productos</title><style>${styles}</style></head><body><div class="sheet">${cards}</div></body></html>`);
		win.document.close();
		win.focus();
		setTimeout(() => win.print(), 350);
	}

	/* â”€â”€ Foto del producto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function renderBarcodePreview(code) {
		const target = $('productBarcodePreview');
		if (!target) return;
		const value = String(code || '').trim();
		target.innerHTML = value && /^\d{13}$/.test(value)
			? barcodeSvg(value, { width: 2, height: 34 })
			: (value ? `<span class="barcode-note">CÃ³digo propio: ${esc(value)}</span>` : '');
	}
	async function compressProductPhoto(file, maxSize = 800) {
		try {
			const bitmap = await createImageBitmap(file);
			const scale = Math.min(1, maxSize / Math.max(bitmap.width || 1, bitmap.height || 1));
			const width = Math.max(1, Math.round((bitmap.width || maxSize) * scale));
			const height = Math.max(1, Math.round((bitmap.height || maxSize) * scale));
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = '#ffffff';
			context.fillRect(0, 0, width, height);
			context.drawImage(bitmap, 0, 0, width, height);
			if (bitmap.close) bitmap.close();
			const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
			if (!blob) return file;
			const name = String(file.name || 'producto').replace(/\.[^.]+$/, '') + '.jpg';
			return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
		} catch {
			return file;
		}
	}
	function renderProductPhotoPreview(url) {
		const image = $('productPhotoImage');
		const empty = $('productPhotoEmpty');
		const clear = $('productPhotoClear');
		const preview = $('productPhotoPreview');
		if (!image || !preview) return;
		const value = String(url || '').trim();
		if (value) {
			image.src = value;
			image.hidden = false;
			preview.classList.add('has-photo');
			if (empty) empty.hidden = true;
		} else {
			image.removeAttribute('src');
			image.hidden = true;
			preview.classList.remove('has-photo');
			if (empty) empty.hidden = false;
		}
		if (clear) clear.hidden = !value;
	}
	async function handleProductPhoto(file) {
		if (!file) return;
		if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
			notify('La foto debe ser una imagen PNG, JPG o WebP.', 'error');
			return;
		}
		if (file.size > 8 * 1024 * 1024) {
			notify('La imagen es muy grande (mÃ¡ximo 8 MB).', 'error');
			return;
		}
		const hint = $('productPhotoHint');
		if (hint) hint.textContent = 'Procesando imagen...';
		try {
			const compressed = await compressProductPhoto(file);
			state.productPhoto = { file: compressed, url: '', changed: true, preview: '' };
			const previewUrl = URL.createObjectURL(compressed);
			state.productPhoto.preview = previewUrl;
			renderProductPhotoPreview(previewUrl);
			if (hint) hint.textContent = `Lista: ${compressed.name} (${Math.round(compressed.size / 1024)} KB). Se sube al guardar.`;
		} catch {
			if (hint) hint.textContent = 'No se pudo procesar la imagen.';
		}
	}
	async function uploadProductPhoto(productId) {
		const photo = state.productPhoto || {};
		if (!photo.file) return '';
		const database = getDb();
		if (!database || !database.storage || !database.storage.from) {
			notify('El almacenamiento de imÃ¡genes no estÃ¡ disponible.', 'error');
			return '';
		}
		const folder = database.storage.from('productos');
		const path = `productos/${productId || 'nuevo'}-${Date.now()}.jpg`;
		const { error } = await folder.upload(path, photo.file, {
			contentType: photo.file.type || 'image/jpeg',
			upsert: true
		});
		if (error) {
			notify(error.message || 'No se pudo subir la foto.', 'error');
			return '';
		}
		const { data } = folder.getPublicUrl(path);
		return data?.publicUrl || '';
	}

	function resetProductForm() {
		const form = $('productForm');
		if (!form) return;
		form.reset();
		$('productId').value = '';
		$('productCode').value = '';
		$('productName').value = '';
		$('productCategory').value = 'General';
		$('productUnit').value = 'Unidad';
		$('productPrice').value = '0';
		$('productCost').value = '0';
		$('productTax').value = String(Number(state.settings.isv ?? DEFAULT_TAX));
		$('productStock').value = '0';
		$('productMinStock').value = String(Number(state.settings.stockMinimo ?? 0));
		$('productActive').checked = true;
		$('productFormTitle').textContent = 'Nuevo producto';
		$('cancelProductEdit').hidden = true;
		state.editingProductId = null;
		renderBarcodePreview('');
		state.productPhoto = { file: null, url: '', changed: false, preview: '' };
		renderProductPhotoPreview('');
		const photoHint = $('productPhotoHint');
		if (photoHint) photoHint.textContent = 'JPG o PNG. La imagen se reduce a 800 px antes de subirla.';
	}
	function editProduct(productId) {
		const product = state.products.find(item => Number(item.id) === Number(productId));
		if (!product) return;
		$('productId').value = String(product.id);
		$('productCode').value = product.codigo || '';
		$('productName').value = product.nombre || '';
		$('productCategory').value = product.categoria || 'General';
		$('productUnit').value = product.unidad || 'Unidad';
		$('productPrice').value = String(Math.round(Number(product.precio || 0)));
		$('productCost').value = String(Math.round(Number(product.costo || 0)));
		$('productTax').value = String(taxRate(product));
		$('productStock').value = String(product.stock ?? 0);
		$('productMinStock').value = String(product.stock_minimo ?? 0);
		$('productActive').checked = product.activo !== false;
		$('productFormTitle').textContent = 'Editar producto';
		$('cancelProductEdit').hidden = false;
		state.editingProductId = product.id;
		renderBarcodePreview(product.codigo || '');
		state.productPhoto = { file: null, url: product.foto_url || '', changed: false, preview: '' };
		renderProductPhotoPreview(product.foto_url || '');
		const photoHint = $('productPhotoHint');
		if (photoHint) {
			photoHint.textContent = product.foto_url
				? 'Puedes elegir otra imagen para reemplazarla.'
				: 'JPG o PNG. La imagen se reduce a 800 px antes de subirla.';
		}
		$('productForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
		$('productName').focus();
	}
	function readProductForm() {
		return {
			id: $('productId').value ? Number($('productId').value) : null,
			p_codigo: String($('productCode').value || '').trim(),
			p_nombre: String($('productName').value || '').trim(),
			p_categoria: String($('productCategory').value || 'General').trim() || 'General',
			p_unidad: String($('productUnit').value || 'Unidad'),
			p_precio: Math.round(Number($('productPrice').value || 0)),
			p_costo: Math.round(Number($('productCost').value || 0)),
			p_impuesto_porcentaje: round2(Number($('productTax').value || 0)),
			p_stock: round3(Number($('productStock').value || 0)),
			p_stock_minimo: round3(Number($('productMinStock').value || 0)),
			p_activo: Boolean($('productActive').checked)
		};
	}
	async function saveProduct() {
		const form = $('productForm');
		if (!form || !form.reportValidity()) return;
		const values = readProductForm();
		if (!values.p_nombre) {
			notify('Escribe el nombre del producto.', 'error');
			$('productName').focus();
			return;
		}
		if ([values.p_precio, values.p_costo, values.p_stock, values.p_stock_minimo].some(value => !Number.isFinite(value) || value < 0)) {
			notify('Revisa el precio, costo y stock: deben ser nÃºmeros mayores o iguales a cero.', 'error');
			return;
		}
		if (!Number.isFinite(values.p_impuesto_porcentaje) || values.p_impuesto_porcentaje < 0 || values.p_impuesto_porcentaje > 100) {
			notify('El ISV debe ser un nÃºmero entre 0 y 100.', 'error');
			$('productTax').focus();
			return;
		}
		if (!values.p_codigo) {
			values.p_codigo = generateBarcode();
			$('productCode').value = values.p_codigo;
			renderBarcodePreview(values.p_codigo);
		}
		const database = await ensureWritable();
		if (!database) return;
		const rpc = values.id ? 'actualizar_producto' : 'crear_producto';
		const photoUrl = state.productPhoto?.changed
			? await uploadProductPhoto(values.id)
			: (state.productPhoto?.url || '');
		const args = {
			p_codigo: values.p_codigo,
			p_nombre: values.p_nombre,
			p_categoria: values.p_categoria,
			p_unidad: values.p_unidad,
			p_precio: values.p_precio,
			p_costo: values.p_costo,
			p_impuesto_porcentaje: values.p_impuesto_porcentaje,
			p_stock: values.p_stock,
			p_stock_minimo: values.p_stock_minimo,
			p_activo: values.p_activo,
			p_foto_url: photoUrl
		};
		if (values.id) args.p_id = values.id;
		const { error } = await database.rpc(rpc, args);
		if (error) {
			if (isMissingModule(error)) showSetupBanner();
			notify(error.message || 'No se pudo guardar el producto.', 'error');
			return;
		}
		notify(values.id ? 'Producto actualizado.' : 'Producto agregado al catÃ¡logo.');
		resetProductForm();
		await loadProducts(true);
		if (!$('posView').hidden) {
			renderCategories();
			renderPOSProducts();
		}
	}
	function filteredInventory() {
		const search = normalize($('productSearch')?.value || '');
		const filter = $('productFilter')?.value || 'all';
		return state.products
			.filter(product => {
				if (filter === 'low') return product.activo && product.stock <= product.stock_minimo;
				if (filter === 'inactive') return !product.activo;
				return true;
			})
			.filter(product => {
				if (!search) return true;
				return normalize([product.nombre, product.codigo, product.categoria, product.unidad].join(' ')).includes(search);
			})
			.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
	}
	function renderProductList() {
		const list = $('productList');
		const count = $('productCount');
		if (!list) return;
		const products = filteredInventory();
		if (count) count.textContent = `${products.length} producto${products.length === 1 ? '' : 's'}`;
		if (!products.length) {
			setEmpty(list, state.products.length
				? 'No hay productos que coincidan con el filtro.'
				: state.setupMissing
					? 'El inventario todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
					: 'TodavÃ­a no hay productos. Agrega el primero con el formulario.');
			return;
		}
		list.innerHTML = products.map(product => {
			const empty = product.stock <= 0;
			const low = !empty && product.stock <= product.stock_minimo;
			const className = empty ? 'empty' : low ? 'low' : '';
			const stockText = empty ? 'Sin stock' : `Stock: ${formatQty(product.stock)}`;
			return `
				<div class="data-row product-row${product.activo ? '' : ' inactive'}">
					<div class="product-row-photo">
						${product.foto_url
							? `<img src="${esc(product.foto_url)}" alt="${esc(product.nombre)}" loading="lazy">`
							: '<span aria-hidden="true">Sin foto</span>'}
					</div>
					<div class="row-main">
						<div class="product-row-title">
							<strong>${esc(product.nombre)}</strong>
							<span class="stock-tag ${className}">${stockText}</span>
							${product.activo ? '' : '<span class="status-pill amber">Inactivo</span>'}
						</div>
						<p class="product-row-meta">
							${product.codigo ? `<span>CÃ³digo: ${esc(product.codigo)}</span>` : '<span>Sin cÃ³digo</span>'}
							<span>${esc(product.categoria || 'General')}</span>
							<span>${esc(product.unidad || 'Unidad')}</span>
							<span class="product-row-price">${moneyWhole(product.precio)}</span>
							<span>ISV ${formatQty(taxRate(product))}% Â· Base ${money(priceWithoutTax(product))}</span>
							<span>Costo: ${moneyWhole(product.costo)}</span>
							<span>MÃ­nimo: ${formatQty(product.stock_minimo)}</span>
						</p>
					</div>
					<div class="row-actions">
						<button class="button small" type="button" data-product-edit="${product.id}">Editar</button>
						<button class="button small" type="button" data-product-label="${product.id}">Etiqueta</button>
						<button class="button small" type="button" data-product-stock="${product.id}">Ajustar stock</button>
						<button class="button small" type="button" data-product-toggle="${product.id}">${product.activo ? 'Desactivar' : 'Activar'}</button>
					</div>
				</div>`;
		}).join('');
	}
	async function adjustStock(productId) {
		const product = state.products.find(item => Number(item.id) === Number(productId));
		if (!product) return;
		const value = window.prompt(`Stock actual de "${product.nombre}": ${formatQty(product.stock)}\n\nEscribe el nuevo stock:`, String(product.stock));
		if (value === null) return;
		const nextStock = round3(Number(value));
		if (!Number.isFinite(nextStock) || nextStock < 0) {
			notify('El stock debe ser un nÃºmero mayor o igual a cero.', 'error');
			return;
		}
		const note = window.prompt('Nota del ajuste (opcional):', 'Ajuste manual');
		if (note === null) return;
		const database = await ensureWritable();
		if (!database) return;
		const { error } = await database.rpc('ajustar_stock', {
			p_producto_id: Number(product.id),
			p_nuevo_stock: nextStock,
			p_nota: String(note || '').trim()
		});
		if (error) {
			if (isMissingModule(error)) showSetupBanner();
			notify(error.message || 'No se pudo ajustar el stock.', 'error');
			return;
		}
		notify('Stock actualizado.');
		await loadProducts(true);
		if (!$('posView').hidden) {
			renderCategories();
			renderPOSProducts();
		}
	}
	async function toggleProduct(productId) {
		const product = state.products.find(item => Number(item.id) === Number(productId));
		if (!product) return;
		const database = await ensureWritable();
		if (!database) return;
		const { error } = await database.rpc('actualizar_producto', {
			p_id: Number(product.id),
			p_codigo: product.codigo || '',
			p_nombre: product.nombre,
			p_categoria: product.categoria || 'General',
			p_unidad: product.unidad || 'Unidad',
			p_precio: Number(product.precio || 0),
			p_costo: Number(product.costo || 0),
			p_impuesto_porcentaje: taxRate(product),
			p_stock: Number(product.stock || 0),
			p_stock_minimo: Number(product.stock_minimo || 0),
			p_activo: !product.activo
		});
		if (error) {
			if (isMissingModule(error)) showSetupBanner();
			notify(error.message || 'No se pudo cambiar el estado del producto.', 'error');
			return;
		}
		notify(product.activo ? 'Producto desactivado.' : 'Producto activado.');
		await loadProducts(true);
		if (!$('posView').hidden) {
			renderCategories();
			renderPOSProducts();
		}
	}
	function csvCell(value) {
		const text = String(value ?? '');
		return `"${text.replace(/"/g, '""')}"`;
	}
	function exportProducts() {
		if (!state.products.length) {
			notify('No hay productos para exportar.', 'error');
			return;
		}
		const rows = [
			['CÃ³digo', 'Nombre', 'CategorÃ­a', 'Unidad', 'Precio con ISV', 'Base sin ISV', 'ISV %', 'Costo', 'Stock', 'Stock mÃ­nimo', 'Activo'],
			...state.products.map(product => [
				product.codigo || '', product.nombre, product.categoria || 'General', product.unidad || 'Unidad',
				Number(product.precio || 0).toFixed(2), priceWithoutTax(product).toFixed(2), taxRate(product).toFixed(2),
				Number(product.costo || 0).toFixed(2),
				product.stock, product.stock_minimo, product.activo ? 'SÃ­' : 'No'
			])
		];
		const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `productos-${today()}.csv`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
		notify('Inventario exportado a CSV.');
	}

	/* â”€â”€ Ventas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function initSalesDates() {
		if (state.salesDatesInitialized) return;
		state.salesDatesInitialized = true;
		const from = $('salesFrom');
		const to = $('salesTo');
		if (from && to && !from.value && !to.value) {
			from.value = today();
			to.value = today();
		}
	}
	async function loadSales() {
		if (state.loadingSales) return;
		const database = getDb();
		if (!database) return;
		const from = $('salesFrom')?.value || '';
		const to = $('salesTo')?.value || '';
		let query = database.from('ventas').select('*').order('fecha', { ascending: false }).limit(300);
		if (from) query = query.gte('fecha', new Date(`${from}T00:00:00`).toISOString());
		if (to) query = query.lte('fecha', new Date(`${to}T23:59:59.999`).toISOString());
		state.loadingSales = true;
		try {
			const { data, error } = await query;
			if (error) {
				if (isMissingModule(error)) {
					state.salesReady = false;
					showSetupBanner();
					state.sales = [];
					state.salesLoaded = false;
					renderSalesList();
					return;
				}
				notify(error.message || 'No se pudieron consultar las ventas.', 'error');
				return;
			}
			state.sales = (data || []).map(normalizeSale);
			state.salesLoaded = true;
			state.salesReady = true;
			hideSetupIfReady();
			renderSalesList();
		} finally {
			state.loadingSales = false;
		}
	}
	async function renderSalesView(force = false) {
		if (!isPosRole() || !$('salesView')) return;
		initSalesDates();
		await loadSales();
	}
	function filteredSales() {
		const term = normalize($('salesSearch')?.value || '');
		if (!term) return state.sales;
		return state.sales.filter(sale => normalize([
			sale.numero_venta, sale.cliente_nombre, sale.cliente_rtn, sale.tipo_documento,
			sale.metodo_pago, sale.total, sale.estado, sale.nota
		].join(' ')).includes(term));
	}
	function renderSalesSummary(sales) {
		const target = $('salesSummary');
		if (!target) return;
		const completed = sales.filter(sale => sale.estado !== 'Anulada');
		const total = round2(completed.reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const cash = round2(completed.filter(sale => sale.metodo_pago === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const card = round2(completed.filter(sale => sale.metodo_pago === 'Tarjeta').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const transfer = round2(completed.filter(sale => sale.metodo_pago === 'Transferencia').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const tax = round2(completed.reduce((sum, sale) => sum + Number(sale.impuesto || 0), 0));
		const average = completed.length ? round2(total / completed.length) : 0;
		target.innerHTML = `
			<div class="sales-metric"><span>Ventas</span><strong>${completed.length}</strong></div>
			<div class="sales-metric"><span>Ingresos</span><strong>${money(total)}</strong></div>
			<div class="sales-metric"><span>ISV incluido</span><strong>${money(tax)}</strong></div>
			<div class="sales-metric cash"><span>Efectivo</span><strong>${money(cash)}</strong></div>
			<div class="sales-metric card"><span>Tarjeta</span><strong>${money(card)}</strong></div>
			<div class="sales-metric transfer"><span>Transferencia</span><strong>${money(transfer)}</strong></div>
			<div class="sales-metric"><span>Ticket promedio</span><strong>${money(average)}</strong></div>`;
	}
	function renderSalesList() {
		const list = $('salesList');
		const count = $('salesCount');
		if (!list) return;
		const sales = filteredSales();
		renderSalesSummary(sales);
		if (count) count.textContent = `${sales.length} venta${sales.length === 1 ? '' : 's'}`;
		if (!sales.length) {
			setEmpty(list, state.setupMissing
				? 'El mÃ³dulo de ventas todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
				: 'No hay ventas en el perÃ­odo seleccionado.');
			return;
		}
		const canAnnul = ws().activeUserRole === 'admin';
		list.innerHTML = sales.map(sale => {
			const annulled = sale.estado === 'Anulada';
			return `
				<div class="data-row sales-row">
					<div class="row-main">
						<strong><span class="sale-number">#${padSale(sale.numero_venta)}</span> Â· ${esc(sale.cliente_nombre || 'Consumidor Final')} <span class="doc-badge ${documentTypeOf(sale) === 'Factura' ? 'invoice' : 'receipt'}">${documentLabel(sale)}</span></strong>
						<p>${esc(formatDateTime(sale.fecha))} Â· ${esc(sale.metodo_pago || 'Efectivo')}${sale.banco ? ` Â· ${esc(sale.banco)}` : ''}${sale.cliente_rtn ? ` Â· RTN ${esc(sale.cliente_rtn)}` : ''}${sale.vendedor_nombre ? ` Â· Vendedor ${esc(sale.vendedor_nombre)}` : ''} Â· <span class="sale-status${annulled ? ' annulled' : ''}">${esc(sale.estado || 'Completada')}</span></p>
					</div>
					<div class="row-actions">
						<span class="sale-total">${money(sale.total)}</span>
						<button class="button small" type="button" data-sale-view="${sale.id}">Ver</button>
						${canAnnul && !annulled ? `<button class="button small" type="button" data-sale-annul="${sale.id}">Anular</button>` : ''}
					</div>
				</div>`;
		}).join('');
	}
	async function openSaleTicket(saleId, saleRow) {
		const database = getDb();
		if (!database) return;
		let sale = saleRow ? normalizeSale(saleRow) : state.sales.find(item => Number(item.id) === Number(saleId));
		if (!sale) {
			const { data, error } = await database.from('ventas').select('*').eq('id', Number(saleId)).single();
			if (error || !data) {
				notify('No se pudo recuperar la venta.', 'error');
				return;
			}
			sale = normalizeSale(data);
		}
		const { data: details, error: detailError } = await database
			.from('venta_detalle')
			.select('*')
			.eq('venta_id', Number(saleId))
			.order('id');
		if (detailError) {
			if (isMissingModule(detailError)) showSetupBanner();
			notify(detailError.message || 'No se pudo recuperar el detalle de la venta.', 'error');
			return;
		}
		let cai = null;
		if (sale.cai_id) {
			const { data: caiData } = await database.from('configuracion_cai').select('*').eq('id', sale.cai_id).single();
			cai = caiData || null;
		}
		state.currentTicketHtml = buildTicket(sale, details || [], cai);
		state.currentTicketTitle = `${documentLabel(sale)} #${padSale(sale.numero_venta)}`;
		const content = $('ticketContent');
		const modal = $('ticketModal');
		const title = $('ticketModalTitle');
		if (!content || !modal) return;
		content.innerHTML = state.currentTicketHtml;
		if (title) title.textContent = state.currentTicketTitle;
		modal.hidden = false;
		document.body.classList.add('pos-modal-open');
		$('closeTicketModal')?.focus();
	}
	function buildTicket(sale, details, cai = null) {
		const settings = state.settings;
		const documentType = documentTypeOf(sale);
		const isInvoice = documentType === 'Factura';
		const annulled = sale.estado === 'Anulada';
		const taxAmount = round2(Number(sale.impuesto || 0));
		const total = round2(Number(sale.total || 0));
		const base = round2(Number(sale.base_gravada || Math.max(0, total - taxAmount)));
		const rates = [...new Set((details || [])
			.map(detail => Number(detail.impuesto_porcentaje ?? DEFAULT_TAX))
			.filter(rate => Number.isFinite(rate)))];
		const taxLabel = rates.length === 1 ? `ISV ${formatQty(rates[0])}% incluido` : 'ISV incluido';
		const baseLabel = rates.length === 1 ? `Base gravable (${formatQty(rates[0])}%)` : 'Base gravable';
		const businessRtn = normalizeRtn(settings.rtn || '');
		const customerRtn = normalizeRtn(sale.cliente_rtn || '');
		const rows = (details || []).map(detail => {
			const rate = Number(detail.impuesto_porcentaje ?? DEFAULT_TAX);
			return `
			<tr>
				<td>
					<span class="ticket-item-name">${esc(detail.nombre)}</span>
					<span class="ticket-item-detail">${formatQty(detail.cantidad)} x ${moneyWhole(detail.precio_unitario)} Â· ISV ${formatQty(rate)}%</span>
				</td>
				<td>${moneyWhole(detail.subtotal)}</td>
			</tr>`;
		}).join('');
		return `
			<div class="ticket-paper">
				<div class="ticket-center">
					<p class="ticket-brand">${esc(settings.negocio || 'WS ABARROTES').toUpperCase()}</p>
					<p class="ticket-sub">${esc(settings.direccion || 'Punto de venta Â· Abarrotes')}</p>
					${settings.telefono ? `<p class="ticket-sub">Tel. ${esc(settings.telefono)}</p>` : ''}
					${businessRtn ? `<p class="ticket-sub">RTN: ${esc(businessRtn)}</p>` : ''}
					<p class="ticket-document">${isInvoice ? 'FACTURA COMERCIAL' : 'RECIBO DE VENTA'}</p>
				</div>
				<div class="ticket-rule"></div>
				<div class="ticket-line"><span>${isInvoice ? 'Factura' : 'Recibo'}</span><span>#${padSale(sale.numero_venta)}</span></div>
				<div class="ticket-line"><span>Fecha</span><span>${esc(formatDateTime(sale.fecha))}</span></div>
				<div class="ticket-line"><span>Cliente</span><span>${esc(sale.cliente_nombre || 'Consumidor Final')}</span></div>
				${isInvoice || customerRtn ? `<div class="ticket-line"><span>RTN cliente</span><span>${esc(customerRtn || 'â€”')}</span></div>` : ''}
				<div class="ticket-line"><span>Vendedor</span><span>${esc(sale.vendedor_nombre || ws().activeUserName || 'â€”')}</span></div>
				${annulled ? `<div class="ticket-annulled">VENTA ANULADA${sale.motivo_anulacion ? `<br>${esc(sale.motivo_anulacion)}` : ''}</div>` : ''}
				<div class="ticket-rule"></div>
				<table class="ticket-items">
					<thead><tr><th>Producto</th><th>Importe</th></tr></thead>
					<tbody>${rows || '<tr><td colspan="2">Sin detalle</td></tr>'}</tbody>
				</table>
				<div class="ticket-totals">
					<div class="ticket-line"><span>Subtotal (con ISV)</span><span>${money(sale.subtotal)}</span></div>
					${Number(sale.descuento || 0) > 0 ? `<div class="ticket-line"><span>Descuento</span><span>- ${money(sale.descuento)}</span></div>` : ''}
					<div class="ticket-line"><span>${baseLabel}</span><span>${money(base)}</span></div>
					<div class="ticket-line ticket-tax"><span>${taxLabel}</span><span>${money(taxAmount)}</span></div>
					<div class="ticket-total"><span>TOTAL</span><span>${money(total)}</span></div>
				${isInvoice && cai ? `<div class="ticket-line"><span>CAI</span><span>${esc(cai.cai)}</span></div>
				<div class="ticket-line"><span>Factura</span><span>${esc(sale.numero_factura || '')}</span></div>
				<div class="ticket-line"><span>Rango</span><span>${esc(cai.establecimiento)}-${esc(cai.punto_emision)}-${esc(cai.tipo_documento)}-${esc(String(cai.correlativo_desde).padStart(6, '0'))} a ${esc(String(cai.correlativo_hasta).padStart(6, '0'))}</span></div>
				<div class="ticket-line"><span>VÃ¡lido hasta</span><span>${esc(formatDate(cai.fecha_limite))}</span></div>` : ''}
				<div class="ticket-line"><span>Monto en letras</span><span>${esc(numeroALetras(total))}</span></div>
					<div class="ticket-line"><span>Pago</span><span>${esc(sale.metodo_pago || 'Efectivo')}</span></div>
					${sale.banco ? `<div class="ticket-line"><span>Banco / POS</span><span>${esc(sale.banco)}</span></div>` : ''}
					${sale.metodo_pago === 'Efectivo' ? `<div class="ticket-line"><span>Recibido</span><span>${money(sale.monto_recibido)}</span></div><div class="ticket-line"><span>Cambio</span><span>${money(sale.cambio)}</span></div>` : ''}
				</div>
				${sale.nota ? `<div class="ticket-rule"></div><div class="ticket-sub">Nota: ${esc(sale.nota)}</div>` : ''}
				<div class="ticket-rule"></div>
				<p class="ticket-foot">${esc(settings.pie || 'Â¡Gracias por su compra!')}<br>${esc(settings.negocio || 'WS Abarrotes')} Â· Precios con ISV incluido</p>
			</div>`;
	}
	function closeTicket() {
		const modal = $('ticketModal');
		if (modal) modal.hidden = true;
		document.body.classList.remove('pos-modal-open');
	}
	function printTicket() {
		if (!state.currentTicketHtml) {
			notify('No hay un ticket para imprimir.', 'error');
			return;
		}
		const printWindow = window.open('', '_blank', 'width=430,height=720');
		if (!printWindow) {
			notify('Permite las ventanas emergentes para imprimir el ticket.', 'error');
			return;
		}
		const styles = `
			@page { size: 80mm auto; margin: 3mm; }
			* { box-sizing: border-box; }
			body { margin: 0; background: #fff; color: #17202b; font-family: "Consolas", "Courier New", monospace; font-size: 11px; line-height: 1.45; }
			.ticket-paper { width: 100%; max-width: none; margin: 0; padding: 0; background: #fff; color: #17202b; font-family: "Consolas", "Courier New", monospace; font-size: 11px; line-height: 1.45; }
			.ticket-center { text-align: center; }
			.ticket-brand { margin: 0; font-family: "Segoe UI", sans-serif; font-size: 19px; font-weight: 700; letter-spacing: 1px; }
			.ticket-sub { margin: 3px 0 0; color: #5d6876; font-size: 9px; }
			.ticket-document { margin: 6px 0 0; padding: 3px 0; border-top: 1px solid #17202b; border-bottom: 1px solid #17202b; font-size: 11px; font-weight: 700; letter-spacing: .8px; }
			.ticket-rule { margin: 9px 0; border-top: 1px dashed #9aa3af; }
			.ticket-line { display: flex; justify-content: space-between; gap: 10px; }
			.ticket-line span:last-child { text-align: right; }
			.ticket-items { width: 100%; border-collapse: collapse; }
			.ticket-items th { padding: 3px 0; border-bottom: 1px dashed #c4cad2; color: #5d6876; font-size: 9px; text-align: left; font-weight: 400; }
			.ticket-items th:last-child, .ticket-items td:last-child { text-align: right; }
			.ticket-items td { padding: 4px 0; vertical-align: top; border-bottom: 1px dotted #e3e6ea; font-size: 10px; }
			.ticket-item-name { display: block; font-weight: 700; }
			.ticket-item-detail { display: block; color: #6f7a88; font-size: 9px; }
			.ticket-totals { margin-top: 7px; }
			.ticket-tax { margin-top: 2px; padding: 3px 0; border-top: 1px dotted #9aa3af; border-bottom: 1px dotted #9aa3af; font-weight: 700; }
			.ticket-total { margin-top: 7px; padding-top: 6px; border-top: 1px solid #17202b; display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; }
			.ticket-foot { margin: 10px 0 0; color: #6f7a88; font-size: 9px; text-align: center; }
			.ticket-annulled { margin: 8px 0; padding: 5px; border: 1px solid #b33; color: #a4262c; font-size: 10px; font-weight: 700; text-align: center; }`;
		printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(state.currentTicketTitle)}</title><style>${styles}</style></head><body>${state.currentTicketHtml}</body></html>`);
		printWindow.document.close();
		printWindow.focus();
		setTimeout(() => {
			printWindow.print();
		}, 250);
	}
	async function annulSale(saleId) {
		if (ws().activeUserRole !== 'admin') {
			notify('Solo un administrador puede anular ventas.', 'error');
			return;
		}
		const sale = state.sales.find(item => Number(item.id) === Number(saleId));
		if (!sale) return;
		if (sale.estado === 'Anulada') {
			notify('La venta ya estÃ¡ anulada.', 'error');
			return;
		}
		const reason = window.prompt(`Motivo de la anulaciÃ³n de la venta #${padSale(sale.numero_venta)}:`, '');
		if (reason === null) return;
		if (!reason.trim()) {
			notify('Escribe el motivo de la anulaciÃ³n.', 'error');
			return;
		}
		const database = await ensureWritable();
		if (!database) return;
		const { error } = await database.rpc('anular_venta', {
			p_id: Number(sale.id),
			p_motivo: reason.trim()
		});
		if (error) {
			if (isMissingModule(error)) showSetupBanner();
			notify(error.message || 'No se pudo anular la venta.', 'error');
			return;
		}
		notify('Venta anulada y stock devuelto.');
		await loadSales();
		await loadProducts(true);
		await loadTodaySummary();
		if (!$('posView').hidden) {
			renderCategories();
			renderPOSProducts();
		}
	}

	/* â”€â”€ Eventos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function bindEvents() {
		const posSearch = $('posSearch');
		posSearch?.addEventListener('input', renderPOSProducts);
		posSearch?.addEventListener('keydown', event => {
			if (event.key !== 'Enter') return;
			event.preventDefault();
			const term = normalize(posSearch.value);
			if (!term) return;
			const exact = state.products.find(product => product.activo && (normalize(product.codigo) === term || normalize(product.nombre) === term));
			if (exact) {
				addToCart(exact.id);
				posSearch.value = '';
				renderPOSProducts();
				return;
			}
			const visible = filteredProducts();
			if (visible.length === 1) {
				addToCart(visible[0].id);
				posSearch.value = '';
				renderPOSProducts();
			} else if (!visible.length) {
				notify('No se encontrÃ³ un producto con esa bÃºsqueda.', 'error');
			} else {
				notify('Selecciona uno de los productos de la lista.');
			}
		});

		$('posScanButton')?.addEventListener('click', () => {
			posSearch?.focus();
			posSearch?.select();
		});
		$('posCategories')?.addEventListener('click', event => {
			const button = event.target.closest('[data-pos-category]');
			if (!button) return;
			state.category = button.dataset.posCategory;
			renderCategories();
			renderPOSProducts();
		});
		$('posGrid')?.addEventListener('click', event => {
			const card = event.target.closest('[data-pos-product]');
			if (card) addToCart(Number(card.dataset.posProduct));
			const newProduct = event.target.closest('[data-pos-action="new-product"]');
			if (newProduct) {
				setView('products');
				resetProductForm();
			}
		});
		$('posCartItems')?.addEventListener('click', event => {
			const minus = event.target.closest('[data-cart-minus]');
			if (minus) {
				const item = state.cart.get(String(minus.dataset.cartMinus));
				if (item) changeQty(minus.dataset.cartMinus, item.qty - productStep(item.product));
				return;
			}
			const plus = event.target.closest('[data-cart-plus]');
			if (plus) {
				const item = state.cart.get(String(plus.dataset.cartPlus));
				if (item) changeQty(plus.dataset.cartPlus, item.qty + productStep(item.product));
				return;
			}
			const remove = event.target.closest('[data-cart-remove]');
			if (remove) removeFromCart(remove.dataset.cartRemove);
		});
		$('posCartItems')?.addEventListener('change', event => {
			const input = event.target.closest('[data-cart-qty]');
			if (input) changeQty(input.dataset.cartQty, input.value);
		});
		$('posCartItems')?.addEventListener('keydown', event => {
			if (event.key === 'Enter' && event.target.matches('[data-cart-qty]')) {
				event.preventDefault();
				event.target.blur();
			}
		});
		$('posCustomer')?.addEventListener('change', () => {
			if ($('posCustomer')?.value) {
				const free = $('posCustomerName');
				if (free) free.value = '';
			}
			updateCustomerTax();
		});
		$('posEditClient')?.addEventListener('click', () => {
			const customer = selectedCustomer();
			if (customer) openEditClient(customer.id);
		});
		$('posCustomerName')?.addEventListener('input', () => {
			const select = $('posCustomer');
			if (select && select.value) select.value = '';
			updateCustomerTax();
		});
		$('posDocumentType')?.addEventListener('click', event => {
			const button = event.target.closest('[data-doc-type]');
			if (button) setDocumentType(button.dataset.docType);
		});
		$('posDiscount')?.addEventListener('input', updateTotals);
		$('posDiscount')?.addEventListener('blur', () => {
			updateTotals();
			const input = $('posDiscount');
			if (!input) return;
			const subtotal = cartSubtotal();
			const discount = round2(Math.max(0, Math.min(Number(input.value || 0), subtotal)));
			input.value = discount > 0 ? discount.toFixed(2) : '';
		});
		$('posCashReceived')?.addEventListener('input', updateTotals);
		$('posCashReceived')?.addEventListener('focus', () => { $('posCashReceived')?.select(); });
		$('posCashReceived')?.addEventListener('click', () => { $('posCashReceived')?.select(); });
	$('posCashReceived')?.addEventListener('blur', () => {
		const input = $('posCashReceived');
		if (!input) return;
		const value = String(input.value || '').replace(',', '.');
		const num = Number(value);
		if (Number.isFinite(num)) {
			input.value = num.toFixed(2);
		}
	});
		// el input es type="text" con inputmode="decimal" para que select() funcione;
		// la validacion de numero se hace en chargeSale()
		$('posDiscount')?.addEventListener('focus', () => { $('posDiscount')?.select(); });
		$('posDiscount')?.addEventListener('click', () => { $('posDiscount')?.select(); });
		$('posNote')?.addEventListener('input', () => {});
		$('posPaymentMethods')?.addEventListener('click', event => {
			const button = event.target.closest('[data-pos-payment]');
			if (button) setPayment(button.dataset.posPayment);
		});
		$('posClearCart')?.addEventListener('click', clearCart);
		$('posChargeButton')?.addEventListener('click', () => { void chargeSale(); });

		$('productForm')?.addEventListener('submit', event => {
			event.preventDefault();
			void saveProduct();
		});
		$('cancelProductEdit')?.addEventListener('click', resetProductForm);
		['productPrice', 'productCost', 'productStock', 'productMinStock', 'productTax'].forEach(id => {
			$(id)?.addEventListener('focus', () => { $(id)?.select(); });
			$(id)?.addEventListener('click', () => { $(id)?.select(); });
		});
		$('productPhoto')?.addEventListener('change', event => {
			const file = event.target.files && event.target.files[0];
			if (file) void handleProductPhoto(file);
		});
		$('productPhotoClear')?.addEventListener('click', () => {
			state.productPhoto = { file: null, url: '', changed: false, preview: '' };
			const input = $('productPhoto');
			if (input) input.value = '';
			renderProductPhotoPreview('');
			const hint = $('productPhotoHint');
			if (hint) hint.textContent = 'La foto se quitarÃ¡ al guardar el producto.';
		});
		$('productSearch')?.addEventListener('input', renderProductList);
		$('productFilter')?.addEventListener('change', renderProductList);
		$('productCodeGenerate')?.addEventListener('click', () => {
			const code = generateBarcode();
			$('productCode').value = code;
			renderBarcodePreview(code);
			notify(`CÃ³digo generado: ${code}`);
		});
		$('productCode')?.addEventListener('input', () => renderBarcodePreview($('productCode').value));		$('productList')?.addEventListener('click', event => {
			const label = event.target.closest('[data-product-label]');
			if (label) {
				const product = state.products.find(item => Number(item.id) === Number(label.dataset.productLabel));
				if (product) printProductLabels([product]);
				return;
			}
			const edit = event.target.closest('[data-product-edit]');
			if (edit) { editProduct(edit.dataset.productEdit); return; }
			const stock = event.target.closest('[data-product-stock]');
			if (stock) { void adjustStock(stock.dataset.productStock); return; }
			const toggle = event.target.closest('[data-product-toggle]');
			if (toggle) void toggleProduct(toggle.dataset.productToggle);
		});

		$('customerForm')?.addEventListener('submit', event => {
			event.preventDefault();
			void saveCustomer();
		});
		$('customerList')?.addEventListener('click', event => {
			const edit = event.target.closest('[data-customer-edit]');
			if (edit) { editCustomer(edit.dataset.customerEdit); return; }
			const use = event.target.closest('[data-customer-use]');
			if (use) useCustomerInPos(use.dataset.customerUse);
		});
		$('customerSearch')?.addEventListener('input', renderCustomerList);
		$('cancelCustomerEdit')?.addEventListener('click', resetCustomerForm);

		$('inventorySearch')?.addEventListener('input', renderInventoryList);
		$('inventoryType')?.addEventListener('change', renderInventoryList);
		$('refreshInventory')?.addEventListener('click', () => { void refreshInventory(); });
		$('exportInventory')?.addEventListener('click', exportInventory);

		$('applyReports')?.addEventListener('click', () => { state.reportsLoaded = false; void renderReportsView(true); });
		$('reportsToday')?.addEventListener('click', () => setReportRange('today'));
		$('reportsMonth')?.addEventListener('click', () => setReportRange('month'));
		$('exportReport')?.addEventListener('click', exportReport);

		$('settingsForm')?.addEventListener('submit', event => {
			event.preventDefault();
			saveSettingsForm();
		});
		$('resetSettings')?.addEventListener('click', resetSettingsForm);
	$('caiForm')?.addEventListener('submit', event => {
		event.preventDefault();
		void saveCaiForm();
	});
	$('caiCancel')?.addEventListener('click', () => {
		const id = $('caiId');
		if (id) id.value = '';
		renderCaiForm();
	});

		$('supplierForm')?.addEventListener('submit', event => {
			event.preventDefault();
			void saveSupplier();
		});
		$('supplierList')?.addEventListener('click', event => {
			const edit = event.target.closest('[data-supplier-edit]');
			if (edit) { editSupplier(edit.dataset.supplierEdit); return; }
			const use = event.target.closest('[data-supplier-use]');
			if (use) useSupplierForPurchase(use.dataset.supplierUse);
		});
		$('supplierSearch')?.addEventListener('input', renderSupplierList);
		$('cancelSupplierEdit')?.addEventListener('click', resetSupplierForm);

		$('purchaseAddItem')?.addEventListener('click', addPurchaseItem);
		$('purchaseSave')?.addEventListener('click', () => { void savePurchase(); });
		$('purchaseClear')?.addEventListener('click', clearPurchase);
		['purchaseQty', 'purchaseCost'].forEach(id => {
			$(id)?.addEventListener('focus', () => { $(id)?.select(); });
			$(id)?.addEventListener('click', () => { $(id)?.select(); });
		});
		$('purchaseItems')?.addEventListener('click', event => {
			const remove = event.target.closest('[data-purchase-remove]');
			if (remove) removePurchaseItem(Number(remove.dataset.purchaseRemove));
		});
		$('purchaseSupplier')?.addEventListener('change', () => {
			fillPurchaseProducts();
		});

		$('cashForm')?.addEventListener('submit', event => {
			event.preventDefault();
			void submitCash();
		});
		$('cashAmount')?.addEventListener('focus', () => { $('cashAmount')?.select(); });
		$('cashAmount')?.addEventListener('click', () => { $('cashAmount')?.select(); });
		$('cashAmount')?.addEventListener('focus', () => { $('cashAmount')?.select(); });
		$('cashAmount')?.addEventListener('click', () => { $('cashAmount')?.select(); });

		$('userForm')?.addEventListener('submit', event => {
			event.preventDefault();
			void saveUser();
		});
		$('userList')?.addEventListener('click', event => {
			const edit = event.target.closest('[data-user-edit]');
			if (edit) editUser(edit.dataset.userEdit);
		});

		$('posNewClient')?.addEventListener('click', openQuickClient);
		$('closeQuickClientModal')?.addEventListener('click', closeQuickClient);
		$('cancelQuickClient')?.addEventListener('click', closeQuickClient);
		$('quickClientForm')?.addEventListener('submit', event => {
			event.preventDefault();
			void saveQuickClient();
		});
		['quickClientRtn', 'quickClientPhone'].forEach(id => {
			$(id)?.addEventListener('focus', () => { $(id)?.select(); });
			$(id)?.addEventListener('click', () => { $(id)?.select(); });
		});

		$('filterSales')?.addEventListener('click', () => { void loadSales(); });
		$('clearSalesFilter')?.addEventListener('click', () => {
			const from = $('salesFrom');
			const to = $('salesTo');
			const search = $('salesSearch');
			if (from) from.value = '';
			if (to) to.value = '';
			if (search) search.value = '';
			void loadSales();
		});
		$('salesSearch')?.addEventListener('input', renderSalesList);
		$('salesList')?.addEventListener('click', event => {
			const view = event.target.closest('[data-sale-view]');
			if (view) { void openSaleTicket(view.dataset.saleView); return; }
			const annul = event.target.closest('[data-sale-annul]');
			if (annul) void annulSale(annul.dataset.saleAnnul);
		});

		$('closeTicketModal')?.addEventListener('click', closeTicket);
		$('closeTicketButton')?.addEventListener('click', closeTicket);
		$('printTicketButton')?.addEventListener('click', printTicket);
		$('ticketModal')?.addEventListener('click', event => {
			if (event.target === $('ticketModal')) closeTicket();
		});
		document.addEventListener('keydown', event => {
			if (event.key === 'Escape' && !$('ticketModal')?.hidden) {
				closeTicket();
				return;
			}
			if (event.key === 'F2') {
				event.preventDefault();
				setView('pos');
				$('posSearch')?.focus();
				return;
			}
			if (event.key === 'F4' && !$('posView')?.hidden) {
				event.preventDefault();
				if (!$('posChargeButton')?.disabled) void chargeSale();
			}
		});

		$('ribbon')?.addEventListener('click', event => {
			const command = event.target.closest('[data-pos-action]');
			if (!command) return;
			const action = command.dataset.posAction;
			if (action === 'clear') {
				setView('pos');
				clearCart();
				return;
			}
			if (action === 'charge') {
				setView('pos');
				void chargeSale();
				return;
			}
			if (action === 'search') {
				setView('pos');
				$('posSearch')?.focus();
				return;
			}
			if (action === 'go-products') { setView('products'); return; }
			if (action === 'go-sales') { setView('sales'); return; }
			if (action === 'new-product') {
				setView('products');
				resetProductForm();
				$('productName')?.focus();
				return;
			}
			if (action === 'save-product') {
				setView('products');
				$('productForm')?.requestSubmit();
				return;
			}
			if (action === 'search-product') {
				setView('products');
				$('productSearch')?.focus();
				return;
			}
			if (action === 'low-stock') {
				setView('products');
				const filter = $('productFilter');
				if (filter) filter.value = 'low';
				renderProductList();
				return;
			}
			if (action === 'export-products') { exportProducts(); return; }
			if (action === 'today') {
				setView('sales');
				$('salesFrom').value = today();
				$('salesTo').value = today();
				void loadSales();
				return;
			}
			if (action === 'filter-sales') { setView('sales'); void loadSales(); return; }
			if (action === 'clear-sales') {
				$('salesFrom').value = '';
				$('salesTo').value = '';
				$('salesSearch').value = '';
				setView('sales');
				void loadSales();
				return;
			}
			if (action === 'refresh-dashboard') { void refreshDashboard(); return; }
			if (action === 'go-pos') { setView('pos'); $('posSearch')?.focus(); return; }
			if (action === 'go-reports') { setView('reports'); return; }
			if (action === 'go-settings') { setView('settings'); return; }
			if (action === 'refresh-inventory') { void refreshInventory(); return; }
			if (action === 'inventory-low') {
				setView('products');
				const filter = $('productFilter');
				if (filter) filter.value = 'low';
				renderProductList();
				return;
			}
			if (action === 'export-inventory') { exportInventory(); return; }
			if (action === 'new-customer') {
				setView('customers');
				resetCustomerForm();
				$('customerName')?.focus();
				return;
			}
			if (action === 'save-customer') {
				setView('customers');
				$('customerForm')?.requestSubmit();
				return;
			}
			if (action === 'search-customer') {
				setView('customers');
				$('customerSearch')?.focus();
				return;
			}
			if (action === 'report-today') { setView('reports'); setReportRange('today'); return; }
			if (action === 'report-month') { setView('reports'); setReportRange('month'); return; }
			if (action === 'apply-reports') { setView('reports'); state.reportsLoaded = false; void renderReportsView(true); return; }
			if (action === 'export-report') { exportReport(); return; }
			if (action === 'save-settings') { $('settingsForm')?.requestSubmit(); return; }
			if (action === 'reset-settings') { resetSettingsForm(); return; }
			if (action === 'new-client') { openQuickClient(); return; }
			if (action === 'go-cash') { setView('cash'); return; }
			if (action === 'go-purchases') { setView('purchases'); return; }
			if (action === 'go-suppliers') { setView('suppliers'); return; }
			if (action === 'cash-open') {
				setView('cash');
				$('cashAmount')?.focus();
				return;
			}
			if (action === 'cash-close') {
				setView('cash');
				$('cashAmount')?.focus();
				return;
			}
			if (action === 'refresh-cash') { void refreshCash(); return; }
			if (action === 'new-supplier') {
				setView('suppliers');
				resetSupplierForm();
				$('supplierName')?.focus();
				return;
			}
			if (action === 'save-supplier') {
				setView('suppliers');
				$('supplierForm')?.requestSubmit();
				return;
			}
			if (action === 'add-purchase-item') {
				setView('purchases');
				$('purchaseProduct')?.focus();
				return;
			}
			if (action === 'save-purchase') {
				setView('purchases');
				void savePurchase();
				return;
			}
			if (action === 'clear-purchase') {
				setView('purchases');
				clearPurchase();
				return;
			}
			if (action === 'save-user') {
				setView('users');
				$('userForm')?.requestSubmit();
				return;
			}
			if (action === 'refresh-users') { void refreshUsers(); return; }
			if (action === 'print-labels') {
				setView('products');
				printProductLabels(filteredProducts());
				return;
			}
			if (action === 'print-labels-inventory') {
				setView('inventory');
				const term = normalize($('inventorySearch')?.value || '');
				const products = term
					? state.products.filter(product => normalize([product.nombre, product.codigo, product.categoria].join(' ')).includes(term))
					: state.products;
				printProductLabels(products);
				return;
			}
			if (action === 'generate-barcodes') {
				setView('products');
				void generateMissingBarcodes();
				return;
			}
		});

		// Acciones de los mÃ³dulos que viven dentro de los paneles (no en la cinta).
		document.addEventListener('click', event => {
			if (event.target.closest('#ribbon')) return;
			const command = event.target.closest('[data-pos-action]');
			if (!command) return;
			const action = command.dataset.posAction;
			if (action === 'go-cash') { setView('cash'); return; }
			if (action === 'go-purchases') { setView('purchases'); return; }
			if (action === 'go-products') { setView('products'); return; }
			if (action === 'go-sales') { setView('sales'); return; }
			if (action === 'go-reports') { setView('reports'); return; }
			if (action === 'go-settings') { setView('settings'); return; }
			if (action === 'go-pos') { setView('pos'); return; }
			if (action === 'new-client') { openQuickClient(); return; }
		});

		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && !$('posView')?.hidden) void loadTodaySummary();
		});
	}

	/* â”€â”€ SincronizaciÃ³n entre dispositivos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	const AUTO_REFRESH_MS = 30000;
	function autoRefreshTick() {
		if (document.hidden) return;
		const view = document.querySelector('.ribbon-tab[aria-selected="true"]')?.dataset.view || 'pos';
		try {
			if (view === 'dashboard') void renderDashboardView();
			else if (view === 'sales') void renderSalesView();
			else if (view === 'inventory') void renderInventoryView();
			else if (view === 'cash') void renderCashView();
		} catch { }
	}
	function startAutoRefresh() {
		if (typeof ws().setInterval === 'function') return;
		setInterval(autoRefreshTick, AUTO_REFRESH_MS);
	}

	/* â”€â”€ Inicio / dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function renderDashboardView(force = false) {
		if (!isPosRole() || !$('dashboardView')) return;
		await loadProducts(force);
		await loadSales(force);
		await loadTodaySummary();
		await loadCash(force);
		const dateLabel = $('dashboardDate');
		if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString('es-HN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

		const completed = state.todaySales.filter(sale => sale.estado !== 'Anulada');
		const total = round2(completed.reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const tax = round2(completed.reduce((sum, sale) => sum + Number(sale.impuesto || 0), 0));
		const base = round2(total - tax);
		const cashSales = round2(completed.filter(sale => sale.metodo_pago === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const cardSales = round2(completed.filter(sale => sale.metodo_pago === 'Tarjeta').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const transferSales = round2(completed.filter(sale => sale.metodo_pago === 'Transferencia').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const lowStock = state.products.filter(product => product.activo && Number(product.stock) <= Number(product.stock_minimo));
		const activeProducts = state.products.filter(product => product.activo);
		const inventoryCost = round2(activeProducts.reduce((sum, product) => sum + Number(product.costo || 0) * Number(product.stock || 0), 0));
		const inventorySale = round2(activeProducts.reduce((sum, product) => sum + Number(product.precio || 0) * Number(product.stock || 0), 0));
		const cashOpen = state.currentCash;
		const cashExpected = round2(Number(cashOpen?.monto_inicial || 0) + cashSales);
		const metrics = $('dashboardMetrics');
		if (metrics) {
			metrics.innerHTML = `
				<div class="dashboard-metric"><span>Ventas de hoy</span><strong>${completed.length}</strong><small>${money(total)} cobrados</small></div>
				<div class="dashboard-metric tax"><span>ISV 15% de hoy</span><strong>${money(tax)}</strong><small>Incluido en el precio de venta</small></div>
				<div class="dashboard-metric"><span>Base gravable</span><strong>${money(base)}</strong><small>Total menos ISV</small></div>
				<div class="dashboard-metric"><span>Efectivo en caja</span><strong>${money(cashExpected)}</strong><small>${cashOpen ? 'Caja abierta' : 'Sin caja abierta'} Â· ${money(cashSales)} en efectivo</small></div>
				<div class="dashboard-metric"><span>Productos activos</span><strong>${activeProducts.length}</strong><small>${lowStock.length} con stock bajo</small></div>
				<div class="dashboard-metric"><span>Valor del inventario</span><strong>${money(inventoryCost)}</strong><small>Venta estimada ${money(inventorySale)}</small></div>`;
		}
		const taxStrip = $('dashboardTax');
		if (taxStrip) {
			const basePct = total > 0 ? Math.round(base / total * 100) : 0;
			const taxPct = total > 0 ? 100 - basePct : 0;
			taxStrip.innerHTML = `
				<div class="dashboard-tax-head">
					<span>Impuestos de hoy</span>
					<strong>${money(tax)} de ISV 15%</strong>
				</div>
				<div class="dashboard-tax-bar">
					<span class="base" style="width:${basePct}%"></span>
					<span class="tax" style="width:${taxPct}%"></span>
				</div>
				<div class="dashboard-tax-legend">
					<span><i class="base"></i>Base gravable ${money(base)} Â· ${basePct}%</span>
					<span><i class="tax"></i>ISV 15% ${money(tax)} Â· ${taxPct}%</span>
					<span><i class="total"></i>Total ${money(total)}</span>
				</div>
				<div class="dashboard-tax-legend">
					<span>Efectivo ${money(cashSales)}</span>
					<span>Tarjeta (POS) ${money(cardSales)}</span>
					<span>Transferencia ${money(transferSales)}</span>
				</div>`;
		}

		const recent = state.sales.slice(0, 6);
		const recentTarget = $('dashboardRecentSales');
		if (recentTarget) {
			if (!recent.length) {
				setEmpty(recentTarget, state.setupMissing
					? 'El mÃ³dulo de ventas todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
					: 'TodavÃ­a no hay ventas registradas.');
			} else {
				recentTarget.innerHTML = recent.map(sale => `
					<div class="data-row dashboard-sale-row">
						<div class="row-main">
							<strong>#${padSale(sale.numero_venta)} Â· ${esc(sale.cliente_nombre || 'Consumidor Final')}</strong>
							<p>${esc(formatDateTime(sale.fecha))} Â· ${documentLabel(sale)}${sale.cliente_rtn ? ` Â· RTN ${esc(sale.cliente_rtn)}` : ''}</p>
						</div>
						<div class="row-actions"><span class="sale-total">${money(sale.total)}</span></div>
					</div>`).join('');
			}
		}

		const lowTarget = $('dashboardLowStock');
		if (lowTarget) {
			if (!lowStock.length) {
				setEmpty(lowTarget, state.setupMissing
					? 'El inventario todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
					: 'No hay productos por debajo del stock mÃ­nimo.');
			} else {
				lowTarget.innerHTML = lowStock.slice(0, 8).map(product => `
					<div class="data-row dashboard-low-row">
						<div class="row-main">
							<strong>${esc(product.nombre)}</strong>
							<p>${esc(product.categoria || 'General')} Â· mÃ­nimo ${formatQty(product.stock_minimo)}</p>
						</div>
						<div class="row-actions"><span class="stock-badge low">${formatQty(product.stock)}</span></div>
					</div>`).join('');
			}
		}

		const cashTarget = $('dashboardCash');
		if (cashTarget) {
			const openCashes = state.cash.filter(caja => caja.estado === 'Abierta');
			const sellers = [...new Set(state.sales
				.filter(sale => localDateKey(sale.fecha) === today() && sale.vendedor_nombre)
				.map(sale => sale.vendedor_nombre))];
			if (!openCashes.length && !sellers.length) {
				setEmpty(cashTarget, state.setupMissing
					? 'El mÃ³dulo de caja todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
					: 'TodavÃ­a no hay cajas abiertas ni ventas del dÃ­a.');
			} else {
				cashTarget.innerHTML = [
					...openCashes.map(caja => `
						<div class="data-row dashboard-low-row">
							<div class="row-main">
								<strong>${esc(caja.usuario_nombre || 'Caja')}</strong>
								<p>Caja abierta Â· inicial ${money(caja.monto_inicial)}</p>
							</div>
							<div class="row-actions"><span class="stock-badge low">${esc(caja.fecha || '')}</span></div>
						</div>`),
					...sellers.map(name => `
						<div class="data-row dashboard-low-row">
							<div class="row-main">
								<strong>${esc(name)}</strong>
								<p>Vendedor con ventas hoy</p>
							</div>
						</div>`)
				].join('');
			}
		}
	}
	async function refreshDashboard() {
		await renderDashboardView(true);
	}

	/* â”€â”€ Clientes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadCustomers(force = false) {
		if (state.loadingCustomers) return state.customers;
		if (state.customersLoaded && !force) return state.customers;
		const database = getDb();
		if (!database) return state.customers;
		state.loadingCustomers = true;
		try {
			const { data, error } = await database.from('clientes').select('*').order('nombre');
			if (error) {
				if (isMissingModule(error)) {
					showSetupBanner();
					state.customers = [];
					state.customersLoaded = false;
					return state.customers;
				}
				notify(error.message || 'No se pudieron consultar los clientes.', 'error');
				return state.customers;
			}
			state.customers = (data || []).map(client => ({
				...client,
				rtn: normalizeRtn(client.rtn || '')
			}));
			state.customersLoaded = true;
			await ws().reloadClients?.();
			fillPosCustomers();
			updateCustomerTax();
			return state.customers;
		} finally {
			state.loadingCustomers = false;
		}
	}
	async function renderCustomersView(force = false) {
		if (!isPosRole() || !$('customersView')) return;
		await loadCustomers(force);
		renderCustomerList();
	}
	async function refreshCustomers() {
		state.customersLoaded = false;
		await renderCustomersView(true);
	}
	function renderCustomerList() {
		const list = $('customerList');
		const count = $('customerCount');
		if (!list) return;
		const term = normalize($('customerSearch')?.value || '');
		const customers = state.customers.filter(client => !term || normalize([
			client.nombre, client.rtn, client.telefono, client.correo, client.identidad, client.direccion
		].join(' ')).includes(term));
		if (count) count.textContent = `${customers.length} cliente${customers.length === 1 ? '' : 's'}`;
		if (!customers.length) {
			setEmpty(list, state.setupMissing
				? 'El mÃ³dulo de clientes todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
				: 'No hay clientes registrados con esa bÃºsqueda.');
			return;
		}
		list.innerHTML = customers.map(client => `
			<div class="data-row customer-row">
				<div class="row-main">
					<strong>${esc(client.nombre)}</strong>
					<p>RTN ${esc(client.rtn || 'â€”')}${client.telefono ? ` Â· ${esc(client.telefono)}` : ''}${client.correo ? ` Â· ${esc(client.correo)}` : ''}</p>
				</div>
				<div class="row-actions">
					<button class="button small" type="button" data-customer-use="${client.id}">Usar en venta</button>
					<button class="button small" type="button" data-customer-edit="${client.id}">Editar</button>
				</div>
			</div>`).join('');
	}
	function resetCustomerForm() {
		const form = $('customerForm');
		if (form) form.reset();
		['customerId', 'customerName', 'customerRtn', 'customerPhone', 'customerEmail', 'customerIdentity', 'customerAddress'].forEach(id => {
			const field = $(id);
			if (field) field.value = '';
		});
		const title = $('customerFormTitle');
		if (title) title.textContent = 'Nuevo cliente';
		const cancel = $('cancelCustomerEdit');
		if (cancel) cancel.hidden = true;
		state.editingCustomerId = null;
	}
	function editCustomer(customerId) {
		const customer = state.customers.find(item => Number(item.id) === Number(customerId));
		if (!customer) return;
		$('customerId').value = String(customer.id);
		$('customerName').value = customer.nombre || '';
		$('customerRtn').value = normalizeRtn(customer.rtn || '');
		$('customerPhone').value = customer.telefono || '';
		$('customerEmail').value = customer.correo || '';
		$('customerIdentity').value = customer.identidad || '';
		$('customerAddress').value = customer.direccion || '';
		$('customerFormTitle').textContent = 'Editar cliente';
		$('cancelCustomerEdit').hidden = false;
		state.editingCustomerId = customer.id;
		$('customerName').focus();
	}
	async function saveCustomer() {
		const form = $('customerForm');
		if (!form || !form.reportValidity()) return;
		const name = String($('customerName').value || '').trim();
		const rtn = normalizeRtn($('customerRtn').value);
		if (!name) {
			notify('Escribe el nombre o la razÃ³n social del cliente.', 'error');
			$('customerName').focus();
			return;
		}
		if (rtn && rtn.length !== 14) {
			notify('El RTN debe tener exactamente 14 dÃ­gitos.', 'error');
			$('customerRtn').focus();
			return;
		}
		const database = await ensureWritable();
		if (!database) return;
		const editing = state.editingCustomerId;
		const rpc = editing ? 'actualizar_cliente' : 'crear_cliente';
		const args = {
			p_nombre: name,
			p_telefono: String($('customerPhone').value || '').trim(),
			p_correo: String($('customerEmail').value || '').trim(),
			p_identidad: String($('customerIdentity').value || '').trim(),
			p_direccion: String($('customerAddress').value || '').trim(),
			p_rtn: rtn
		};
		if (editing) args.p_id = Number(editing);
		const { error } = await database.rpc(rpc, args);
		if (error) {
			const message = String(error.message || '').toLowerCase();
			if (message.includes('could not find the function') || message.includes('schema cache') || isMissingModule(error)) {
				showSetupBanner();
				notify('Ejecuta la versiÃ³n actualizada de "data base pos.sql" para guardar clientes con RTN.', 'error');
			} else {
				notify(error.message || 'No se pudo guardar el cliente.', 'error');
			}
			return;
		}
		notify(editing ? 'Cliente actualizado.' : 'Cliente registrado.');
		resetCustomerForm();
		state.customersLoaded = false;
		await loadCustomers(true);
		renderCustomerList();
	}
	function useCustomerInPos(customerId) {
		const select = $('posCustomer');
		if (select) select.value = String(customerId);
		setView('pos');
		updateCustomerTax();
	}

	/* â”€â”€ Inventario â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadInventory(force = false) {
		if (state.loadingInventory) return state.inventory;
		if (state.inventoryLoaded && !force) return state.inventory;
		const database = getDb();
		if (!database) return state.inventory;
		state.loadingInventory = true;
		try {
			const { data, error } = await database
				.from('movimientos_inventario')
				.select('*')
				.order('creado_en', { ascending: false })
				.limit(500);
			if (error) {
				if (isMissingModule(error)) {
					showSetupBanner();
					state.inventory = [];
					state.inventoryLoaded = false;
					return state.inventory;
				}
				notify(error.message || 'No se pudieron consultar los movimientos de inventario.', 'error');
				return state.inventory;
			}
			state.inventory = data || [];
			state.inventoryLoaded = true;
			return state.inventory;
		} finally {
			state.loadingInventory = false;
		}
	}
	async function renderInventoryView(force = false) {
		if (!isPosRole() || !$('inventoryView')) return;
		await loadProducts(force);
		await loadInventory(force);
		renderInventoryMetrics();
		renderInventoryList();
	}
	async function refreshInventory() {
		state.inventoryLoaded = false;
		await renderInventoryView(true);
	}
	function renderInventoryMetrics() {
		const target = $('inventoryMetrics');
		if (!target) return;
		const active = state.products.filter(product => product.activo);
		const low = active.filter(product => Number(product.stock) <= Number(product.stock_minimo));
		const units = round3(active.reduce((sum, product) => sum + Number(product.stock || 0), 0));
		const cost = round2(active.reduce((sum, product) => sum + Number(product.costo || 0) * Number(product.stock || 0), 0));
		const sale = round2(active.reduce((sum, product) => sum + Number(product.precio || 0) * Number(product.stock || 0), 0));
		target.innerHTML = `
			<div class="sales-metric"><span>Productos</span><strong>${active.length}</strong></div>
			<div class="sales-metric"><span>Unidades en stock</span><strong>${formatQty(units)}</strong></div>
			<div class="sales-metric"><span>Stock bajo</span><strong>${low.length}</strong></div>
			<div class="sales-metric"><span>Costo inventario</span><strong>${money(cost)}</strong></div>
			<div class="sales-metric"><span>Venta estimada</span><strong>${money(sale)}</strong></div>`;
	}
	function renderInventoryList() {
		const list = $('inventoryMovements');
		const count = $('inventoryCount');
		if (!list) return;
		const term = normalize($('inventorySearch')?.value || '');
		const type = $('inventoryType')?.value || 'all';
		const productNames = new Map(state.products.map(product => [Number(product.id), product.nombre]));
		const rows = state.inventory.filter(movement => {
			if (type !== 'all' && movement.tipo !== type) return false;
			if (!term) return true;
			return normalize([
				productNames.get(Number(movement.producto_id)), movement.tipo,
				movement.referencia, movement.nota, movement.cantidad, movement.stock_anterior, movement.stock_nuevo
			].join(' ')).includes(term);
		});
		if (count) count.textContent = `${rows.length} movimiento${rows.length === 1 ? '' : 's'}`;
		if (!rows.length) {
			setEmpty(list, state.setupMissing
				? 'El inventario todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
				: 'No hay movimientos para el filtro seleccionado.');
			return;
		}
		list.innerHTML = rows.map(movement => {
			const name = productNames.get(Number(movement.producto_id)) || `Producto #${movement.producto_id}`;
			const positive = Number(movement.cantidad) >= 0;
			return `
				<div class="data-row inventory-row">
					<div class="row-main">
						<strong>${esc(name)} <span class="movement-badge ${esc(String(movement.tipo).toLowerCase())}">${esc(movement.tipo)}</span></strong>
						<p>${esc(formatDateTime(movement.creado_en))} Â· ${esc(movement.referencia || 'Sin referencia')}${movement.nota ? ` Â· ${esc(movement.nota)}` : ''}</p>
					</div>
					<div class="row-actions inventory-values">
						<span class="${positive ? 'stock-in' : 'stock-out'}">${positive ? '+' : ''}${formatQty(movement.cantidad)}</span>
						<small>${formatQty(movement.stock_anterior)} â†’ ${formatQty(movement.stock_nuevo)}</small>
					</div>
				</div>`;
		}).join('');
	}
	function exportInventory() {
		if (!state.inventory.length) {
			notify('No hay movimientos de inventario para exportar.', 'error');
			return;
		}
		const names = new Map(state.products.map(product => [Number(product.id), product.nombre]));
		const rows = [
			['Fecha', 'Producto', 'Tipo', 'Cantidad', 'Stock anterior', 'Stock nuevo', 'Referencia', 'Nota'],
			...state.inventory.map(movement => [
				formatDateTime(movement.creado_en),
				names.get(Number(movement.producto_id)) || `Producto #${movement.producto_id}`,
				movement.tipo, movement.cantidad, movement.stock_anterior, movement.stock_nuevo,
				movement.referencia || '', movement.nota || ''
			])
		];
		downloadCsv(rows, `inventario-${today()}.csv`);
		notify('Movimientos de inventario exportados a CSV.');
	}

	/* â”€â”€ Reportes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function initReportsDates() {
		if (state.reportsDatesInitialized) return;
		const now = new Date();
		const first = new Date(now.getFullYear(), now.getMonth(), 1);
		const toIso = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
		const from = $('reportsFrom');
		const to = $('reportsTo');
		if (from) from.value = toIso(first);
		if (to) to.value = today();
		state.reportsDatesInitialized = true;
	}
	async function loadReports(force = false) {
		if (state.loadingReports) return state.reports;
		if (state.reportsLoaded && !force) return state.reports;
		initReportsDates();
		const database = getDb();
		if (!database) return state.reports;
		const from = $('reportsFrom')?.value || today();
		const to = $('reportsTo')?.value || today();
		const start = new Date(`${from}T00:00:00`);
		const end = new Date(`${to}T23:59:59.999`);
		state.loadingReports = true;
		try {
			const { data, error } = await database
				.from('ventas')
				.select('*')
				.gte('fecha', start.toISOString())
				.lte('fecha', end.toISOString())
				.order('fecha', { ascending: false })
				.limit(2000);
			if (error) {
				if (isMissingModule(error)) {
					showSetupBanner();
					state.reports = { sales: [], details: [], from, to };
					state.reportsLoaded = false;
					return state.reports;
				}
				notify(error.message || 'No se pudieron consultar las ventas del reporte.', 'error');
				return state.reports;
			}
			const sales = (data || []).map(normalizeSale);
			const ids = sales.map(sale => Number(sale.id)).filter(Boolean);
			let details = [];
			if (ids.length) {
				const result = await database
					.from('venta_detalle')
					.select('*')
					.in('venta_id', ids)
					.limit(5000);
				if (result.error) {
					if (isMissingModule(result.error)) showSetupBanner();
					else notify(result.error.message || 'No se pudo consultar el detalle del reporte.', 'error');
				} else {
					details = result.data || [];
				}
			}
			state.reports = { sales, details, from, to };
			state.reportsLoaded = true;
			return state.reports;
		} finally {
			state.loadingReports = false;
		}
	}
	async function renderReportsView(force = false) {
		if (!isPosRole() || !$('reportsView')) return;
		initReportsDates();
		await loadReports(force);
		renderReports();
	}
	async function refreshReports() {
		state.reportsLoaded = false;
		await renderReportsView(true);
	}
	function setReportRange(kind) {
		const now = new Date();
		const toIso = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
		const from = $('reportsFrom');
		const to = $('reportsTo');
		if (kind === 'today') {
			if (from) from.value = today();
			if (to) to.value = today();
		} else {
			if (from) from.value = toIso(new Date(now.getFullYear(), now.getMonth(), 1));
			if (to) to.value = today();
		}
		state.reportsLoaded = false;
		void renderReportsView(true);
	}
	function renderReports() {
		const report = state.reports || { sales: [], details: [], from: today(), to: today() };
		const completed = report.sales.filter(sale => sale.estado !== 'Anulada');
		const total = round2(completed.reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const base = round2(completed.reduce((sum, sale) => sum + Number(sale.base_gravada || 0), 0));
		const tax = round2(completed.reduce((sum, sale) => sum + Number(sale.impuesto || 0), 0));
		const discounts = round2(completed.reduce((sum, sale) => sum + Number(sale.descuento || 0), 0));
		const average = completed.length ? round2(total / completed.length) : 0;
		const rangeLabel = $('reportsRangeLabel');
		if (rangeLabel) rangeLabel.textContent = `${ws().formatDate?.(report.from) || report.from} â€” ${ws().formatDate?.(report.to) || report.to}`;
		const metrics = $('reportsMetrics');
		if (metrics) {
			metrics.innerHTML = `
				<div class="sales-metric"><span>Ventas</span><strong>${completed.length}</strong></div>
				<div class="sales-metric"><span>Ingresos</span><strong>${money(total)}</strong></div>
				<div class="sales-metric"><span>Base gravable</span><strong>${money(base)}</strong></div>
				<div class="sales-metric"><span>ISV incluido</span><strong>${money(tax)}</strong></div>
				<div class="sales-metric"><span>Descuentos</span><strong>${money(discounts)}</strong></div>
				<div class="sales-metric"><span>Ticket promedio</span><strong>${money(average)}</strong></div>`;
		}

		const payments = $('reportsPayments');
		if (payments) {
			const methods = ['Efectivo', 'Tarjeta', 'Transferencia'];
			const groups = methods.map(method => ({
				method,
				count: completed.filter(sale => sale.metodo_pago === method).length,
				total: round2(completed.filter(sale => sale.metodo_pago === method).reduce((sum, sale) => sum + Number(sale.total || 0), 0))
			}));
			const max = Math.max(1, ...groups.map(group => group.total));
			payments.innerHTML = groups.map(group => `
				<div class="report-row">
					<div class="report-row-head"><span>${group.method}</span><strong>${money(group.total)}</strong></div>
					<div class="report-bar"><span style="width:${Math.round(group.total / max * 100)}%"></span></div>
					<small>${group.count} venta${group.count === 1 ? '' : 's'}</small>
				</div>`).join('');
		}

		const completedIds = new Set(completed.map(sale => Number(sale.id)));
		const products = new Map();
		report.details.filter(detail => completedIds.has(Number(detail.venta_id))).forEach(detail => {
			const key = detail.producto_id ? String(detail.producto_id) : `n:${detail.nombre}`;
			const current = products.get(key) || { nombre: detail.nombre, cantidad: 0, total: 0 };
			current.cantidad = round3(current.cantidad + Number(detail.cantidad || 0));
			current.total = round2(current.total + Number(detail.subtotal || 0));
			products.set(key, current);
		});
		const top = [...products.values()].sort((left, right) => right.total - left.total).slice(0, 8);
		const topTarget = $('reportsTopProducts');
		if (topTarget) {
			topTarget.innerHTML = top.length ? top.map((product, index) => `
				<div class="report-row">
					<div class="report-row-head"><span>${index + 1}. ${esc(product.nombre)}</span><strong>${money(product.total)}</strong></div>
					<small>${formatQty(product.cantidad)} unidades vendidas</small>
				</div>`).join('') : '<p class="empty-note">Sin productos vendidos en el perÃ­odo.</p>';
		}

		const taxTarget = $('reportsTax');
		if (taxTarget) {
			const rates = new Map();
			report.details.filter(detail => completedIds.has(Number(detail.venta_id))).forEach(detail => {
				const rate = Number(detail.impuesto_porcentaje ?? DEFAULT_TAX);
				const current = rates.get(rate) || { gross: 0, tax: 0 };
				current.gross = round2(current.gross + Number(detail.subtotal || 0));
				current.tax = round2(current.tax + Number(detail.impuesto_monto || 0));
				rates.set(rate, current);
			});
			const rows = [...rates.entries()].sort((a, b) => a[0] - b[0]);
			taxTarget.innerHTML = rows.length ? rows.map(([rate, values]) => `
				<div class="report-row">
					<div class="report-row-head"><span>ISV ${formatQty(rate)}%</span><strong>${money(values.tax)}</strong></div>
					<small>Base ${money(round2(values.gross - values.tax))} Â· Bruto ${money(values.gross)}</small>
				</div>`).join('') : '<p class="empty-note">Sin detalle de ISV para el perÃ­odo.</p>';
		}
	}
	function exportReport() {
		const report = state.reports;
		if (!report || !report.sales.length) {
			notify('No hay ventas para exportar en el perÃ­odo.', 'error');
			return;
		}
		const rows = [
			['Documento', 'NÃºmero', 'Fecha', 'Cliente', 'RTN', 'Base gravable', 'ISV', 'Descuento', 'Total', 'Pago', 'Estado', 'Nota'],
			...report.sales.map(sale => [
				documentLabel(sale), padSale(sale.numero_venta), formatDateTime(sale.fecha),
				sale.cliente_nombre || 'Consumidor Final', sale.cliente_rtn || '',
				Number(sale.base_gravada || 0).toFixed(2), Number(sale.impuesto || 0).toFixed(2),
				Number(sale.descuento || 0).toFixed(2), Number(sale.total || 0).toFixed(2),
				sale.metodo_pago || '', sale.estado || '', sale.nota || ''
			])
		];
		downloadCsv(rows, `reporte-ventas-${report.from}-a-${report.to}.csv`);
		notify('Reporte de ventas exportado a CSV.');
	}

	/* â”€â”€ ConfiguraciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function renderSettingsView() {
		const settings = state.settings;
		const values = {
			settingsBusinessName: settings.negocio,
			settingsRtn: normalizeRtn(settings.rtn || ''),
			settingsPhone: settings.telefono || '',
			settingsAddress: settings.direccion || '',
			settingsEmail: settings.correo || '',
			settingsFooter: settings.pie || '',
			settingsTax: String(Number(settings.isv ?? DEFAULT_TAX)),
			settingsStockMin: String(Number(settings.stockMinimo ?? 0)),
			settingsCurrency: settings.moneda || 'L.'
		};
		Object.entries(values).forEach(([id, value]) => {
			const field = $(id);
			if (field) field.value = value;
		});
		void renderCaiForm();
	}
	function saveSettingsForm() {
		const form = $('settingsForm');
		if (!form || !form.reportValidity()) return;
		const rtn = normalizeRtn($('settingsRtn').value);
		if (rtn && rtn.length !== 14) {
			notify('El RTN del negocio debe tener exactamente 14 dÃ­gitos.', 'error');
			$('settingsRtn').focus();
			return;
		}
		const isv = round2(Number($('settingsTax').value || 0));
		if (!Number.isFinite(isv) || isv < 0 || isv > 100) {
			notify('El ISV predeterminado debe estar entre 0 y 100.', 'error');
			$('settingsTax').focus();
			return;
		}
		persistSettings({
			negocio: String($('settingsBusinessName').value || '').trim() || DEFAULT_SETTINGS.negocio,
			rtn,
			telefono: String($('settingsPhone').value || '').trim(),
			direccion: String($('settingsAddress').value || '').trim(),
			correo: String($('settingsEmail').value || '').trim(),
			pie: String($('settingsFooter').value || '').trim() || DEFAULT_SETTINGS.pie,
			isv,
			stockMinimo: round3(Number($('settingsStockMin').value || 0)),
			moneda: String($('settingsCurrency').value || 'L.').trim() || 'L.'
		});
		notify('ConfiguraciÃ³n guardada. Se aplicarÃ¡ en las prÃ³ximas facturas.');
		renderSettingsView();
	}
	function resetSettingsForm() {
		persistSettings(DEFAULT_SETTINGS);
		renderSettingsView();
		notify('ConfiguraciÃ³n restaurada.');
	}
	async function renderCaiForm() {
		if (!state.cai) {
			const database = getDb();
			if (database) await loadActiveCai();
		}
		const cai = state.cai;
		const fields = {
			caiCai: cai?.cai || '',
			caiRtn: normalizeRtn(cai?.rtn_emisor || ''),
			caiTipo: cai?.tipo_documento || '01',
			caiEstablecimiento: cai?.establecimiento || '001',
			caiPunto: cai?.punto_emision || '001',
			caiDesde: cai?.correlativo_desde || 1,
			caiHasta: cai?.correlativo_hasta || 500,
			caiFechaLimite: cai?.fecha_limite || '',
			caiActivo: cai?.activo ? 'true' : 'false',
			caiNegocio: cai?.negocio || 'WS Abarrotes',
			caiDireccion: cai?.direccion || '',
			caiTelefono: cai?.telefono || '',
			caiPie: cai?.pie_factura || 'Â¡Gracias por su compra!'
		};
		Object.entries(fields).forEach(([id, value]) => {
			const field = $(id);
			if (field) field.value = value;
		});
		if ($('caiId')) $('caiId').value = cai?.id ? String(cai.id) : '';
		if ($('caiCancel')) $('caiCancel').hidden = !cai;
		renderCaiStatus();
	}
	async function renderCaiStatus() {
		const target = $('caiStatus');
		if (!target) return;
		if (!state.cai) await loadActiveCai();
		const cai = state.cai;
		if (!cai) {
			target.innerHTML = '<p class="empty-note">No hay CAI activo configurado. AgrÃ©galo en este formulario.</p>';
			return;
		}
		const available = cai.correlativo_hasta - cai.correlativo_actual;
		const daysLeft = Math.floor((new Date(cai.fecha_limite) - new Date()) / (1000 * 60 * 60 * 24));
		let alert = '';
		if (available < 5) alert = '<p class="field-hint" style="color:#a4262c;">âš ï¸ Solo quedan menos de 5 facturas disponibles. Solicita un nuevo rango.</p>';
		else if (available < 20) alert = '<p class="field-hint" style="color:#b46900;">âš ï¸ Quedan menos de 20 facturas. Considera solicitar un nuevo rango.</p>';
		if (daysLeft < 30) alert += '<p class="field-hint" style="color:#b46900;">âš ï¸ El CAI vence en menos de 30 dÃ­as.</p>';
		target.innerHTML = `
			<div class="settings-note">
				<p><strong>CAI activo:</strong> ${esc(cai.cai)}</p>
				<p><strong>Negocio:</strong> ${esc(cai.negocio)}</p>
				<p><strong>RTN:</strong> ${esc(normalizeRtn(cai.rtn_emisor))}</p>
				<p><strong>Rango:</strong> ${esc(String(cai.correlativo_desde).padStart(6, '0'))} - ${esc(String(cai.correlativo_hasta).padStart(6, '0'))}</p>
				<p><strong>Usadas:</strong> ${esc(String(cai.correlativo_actual))} Â· <strong>Disponibles:</strong> ${esc(String(available))}</p>
				<p><strong>VÃ¡lido hasta:</strong> ${esc(formatDate(cai.fecha_limite))} (${daysLeft} dÃ­as)</p>
				${alert}
			</div>`;
	}
	async function saveCaiForm() {
		const form = $('caiForm');
		if (!form || !form.reportValidity()) return;
		const cai = String($('caiCai').value || '').trim();
		const rtn = normalizeRtn($('caiRtn').value);
		if (!cai) {
			notify('El CAI es obligatorio.', 'error');
			$('caiCai').focus();
			return;
		}
		if (rtn.length !== 14) {
			notify('El RTN del emisor debe tener 14 dÃ­gitos.', 'error');
			$('caiRtn').focus();
			return;
		}
		const desde = Number($('caiDesde').value || 0);
		const hasta = Number($('caiHasta').value || 0);
		if (desde < 1 || hasta < desde) {
			notify('El rango de correlativos no es vÃ¡lido.', 'error');
			return;
		}
		const fechaLimite = $('caiFechaLimite').value;
		if (!fechaLimite || new Date(fechaLimite) < new Date()) {
			notify('La fecha lÃ­mite no puede ser anterior a hoy.', 'error');
			$('caiFechaLimite').focus();
			return;
		}
		const database = await ensureWritable();
		if (!database) return;
		const args = {
			p_cai: cai,
			p_rtn_emisor: rtn,
			p_establecimiento: String($('caiEstablecimiento').value || '001').trim(),
			p_punto_emision: String($('caiPunto').value || '001').trim(),
			p_tipo_documento: $('caiTipo').value,
			p_correlativo_desde: desde,
			p_correlativo_hasta: hasta,
			p_fecha_limite: fechaLimite,
			p_negocio: String($('caiNegocio').value || 'WS Abarrotes').trim(),
			p_direccion: String($('caiDireccion').value || '').trim(),
			p_telefono: String($('caiTelefono').value || '').trim(),
			p_pie_factura: String($('caiPie').value || 'Â¡Gracias por su compra!').trim(),
			p_activo: $('caiActivo').value === 'true'
		};
		const editingId = $('caiId')?.value ? Number($('caiId').value) : null;
		if (editingId) args.p_id = editingId;
		const { error } = await database.rpc('guardar_cai', args);
		if (error) {
			notify(error.message || 'No se pudo guardar el CAI.', 'error');
			return;
		}
		notify(editingId ? 'CAI actualizado.' : 'CAI guardado.');
		state.cai = null;
		await loadActiveCai();
		await renderCaiForm();
		await renderCaiStatus();
	}

	/* â”€â”€ Descargas CSV â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function downloadCsv(rows, filename) {
		const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}

	async function generateMissingBarcodes() {
		const pending = state.products.filter(product => !isValidBarcode(product.codigo));
		if (!pending.length) {
			notify('Todos los productos ya tienen un cÃ³digo de barras vÃ¡lido.');
			return;
		}
		const database = await ensureWritable();
		if (!database) return;
		notify(`Generando cÃ³digos para ${pending.length} producto(s)...`);
		let generated = 0;
		for (const product of pending) {
			const code = generateBarcode();
			const { error } = await database.rpc('actualizar_producto', {
				p_id: product.id,
				p_codigo: code,
				p_nombre: product.nombre,
				p_categoria: product.categoria || 'General',
				p_unidad: product.unidad || 'Unidad',
				p_precio: Math.round(Number(product.precio || 0)),
				p_costo: Math.round(Number(product.costo || 0)),
				p_impuesto_porcentaje: Number(product.impuesto_porcentaje ?? DEFAULT_TAX),
				p_stock: Number(product.stock || 0),
				p_stock_minimo: Number(product.stock_minimo || 0),
				p_activo: product.activo !== false,
				p_foto_url: product.foto_url || ''
			});
			if (!error) generated += 1;
		}
		await loadProducts(true);
		notify(`${generated} cÃ³digo(s) de barras generado(s).`);
	}

	/* â”€â”€ Vendedores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadSellers(force = false) {
		if (state.sellersLoaded && !force) return state.sellers;
		const database = getDb();
		if (!database) return state.sellers;
		const { data, error } = await database.rpc('usuarios_pos');
		if (error) {
			state.sellers = [];
			state.sellersLoaded = false;
			return state.sellers;
		}
		state.sellers = (data || []).map(user => ({
			id: user.id,
			username: user.username || 'Usuario',
			role: user.role || 'vendedor'
		}));
		state.sellersLoaded = true;
		return state.sellers;
	}
	function fillSellers() {
		const select = $('posSeller');
		const row = $('posSellerRow');
		const canPick = isSupervisorRole();
		if (row) row.hidden = !canPick;
		if (!select || !canPick) return;
		const current = select.value;
		select.innerHTML = state.sellers.map(seller => `
			<option value="${esc(seller.id)}">${esc(seller.username)} Â· ${esc(roleLabel(seller.role))}</option>
		`).join('') || '<option value="">Sin vendedores</option>';
		const me = ws().activeUserName;
		if (current && state.sellers.some(seller => seller.id === current)) {
			select.value = current;
		} else if (me && state.sellers.some(seller => seller.username === me)) {
			select.value = state.sellers.find(seller => seller.username === me).id;
		} else if (state.sellers.length) {
			select.value = state.sellers[0].id;
		}
	}
	function selectedSellerId() {
		const select = $('posSeller');
		const row = $('posSellerRow');
		if (!select || (row && row.hidden)) return null;
		return select.value || null;
	}

	/* â”€â”€ Proveedores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadSuppliers(force = false) {
		if (state.loadingSuppliers) return state.suppliers;
		if (state.suppliersLoaded && !force) return state.suppliers;
		const database = getDb();
		if (!database) return state.suppliers;
		state.loadingSuppliers = true;
		try {
			const { data, error } = await database.from('proveedores').select('*').order('nombre');
			if (error) {
				if (isMissingModule(error)) {
					showSetupBanner();
					state.suppliers = [];
					state.suppliersLoaded = false;
					return state.suppliers;
				}
				notify(error.message || 'No se pudieron consultar los proveedores.', 'error');
				return state.suppliers;
			}
			state.suppliers = data || [];
			state.suppliersLoaded = true;
			fillPurchaseSuppliers();
			return state.suppliers;
		} finally {
			state.loadingSuppliers = false;
		}
	}
	async function renderSuppliersView(force = false) {
		if (!isPosRole() || !$('suppliersView')) return;
		await loadSuppliers(force);
		renderSupplierList();
	}
	async function refreshSuppliers() {
		state.suppliersLoaded = false;
		await renderSuppliersView(true);
	}
	function renderSupplierList() {
		const list = $('supplierList');
		const count = $('supplierCount');
		if (!list) return;
		const term = normalize($('supplierSearch')?.value || '');
		const suppliers = state.suppliers.filter(supplier => !term || normalize([
			supplier.nombre, supplier.rtn, supplier.telefono, supplier.correo, supplier.contacto, supplier.direccion
		].join(' ')).includes(term));
		if (count) count.textContent = `${suppliers.length} proveedor${suppliers.length === 1 ? '' : 'es'}`;
		if (!suppliers.length) {
			setEmpty(list, state.setupMissing
				? 'El mÃ³dulo de proveedores todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
				: 'No hay proveedores con esa bÃºsqueda.');
			return;
		}
		list.innerHTML = suppliers.map(supplier => `
			<div class="data-row customer-row">
				<div class="row-main">
					<strong>${esc(supplier.nombre)}</strong>
					<p>RTN ${esc(supplier.rtn || 'â€”')}${supplier.contacto ? ` Â· ${esc(supplier.contacto)}` : ''}${supplier.telefono ? ` Â· ${esc(supplier.telefono)}` : ''}</p>
				</div>
				<div class="row-actions">
					<button class="button small" type="button" data-supplier-use="${supplier.id}">Comprar</button>
					<button class="button small" type="button" data-supplier-edit="${supplier.id}">Editar</button>
				</div>
			</div>`).join('');
	}
	function resetSupplierForm() {
		const form = $('supplierForm');
		if (form) form.reset();
		['supplierId', 'supplierName', 'supplierRtn', 'supplierPhone', 'supplierEmail', 'supplierContact', 'supplierAddress'].forEach(id => {
			const field = $(id);
			if (field) field.value = '';
		});
		const title = $('supplierFormTitle');
		if (title) title.textContent = 'Nuevo proveedor';
		const cancel = $('cancelSupplierEdit');
		if (cancel) cancel.hidden = true;
		state.editingSupplierId = null;
	}
	function editSupplier(supplierId) {
		const supplier = state.suppliers.find(item => Number(item.id) === Number(supplierId));
		if (!supplier) return;
		$('supplierId').value = String(supplier.id);
		$('supplierName').value = supplier.nombre || '';
		$('supplierRtn').value = normalizeRtn(supplier.rtn || '');
		$('supplierPhone').value = supplier.telefono || '';
		$('supplierEmail').value = supplier.correo || '';
		$('supplierContact').value = supplier.contacto || '';
		$('supplierAddress').value = supplier.direccion || '';
		$('supplierFormTitle').textContent = 'Editar proveedor';
		$('cancelSupplierEdit').hidden = false;
		state.editingSupplierId = supplier.id;
		$('supplierName').focus();
	}
	async function saveSupplier() {
		const form = $('supplierForm');
		if (!form || !form.reportValidity()) return;
		const name = String($('supplierName').value || '').trim();
		const rtn = normalizeRtn($('supplierRtn').value);
		if (!name) {
			notify('Escribe el nombre o la razÃ³n social del proveedor.', 'error');
			$('supplierName').focus();
			return;
		}
		if (rtn && rtn.length !== 14) {
			notify('El RTN debe tener exactamente 14 dÃ­gitos.', 'error');
			$('supplierRtn').focus();
			return;
		}
		const database = await ensureWritable();
		if (!database) return;
		const editing = state.editingSupplierId;
		const args = {
			p_nombre: name,
			p_rtn: rtn,
			p_telefono: String($('supplierPhone').value || '').trim(),
			p_correo: String($('supplierEmail').value || '').trim(),
			p_contacto: String($('supplierContact').value || '').trim(),
			p_direccion: String($('supplierAddress').value || '').trim()
		};
		if (editing) args.p_id = Number(editing);
		const { error } = await database.rpc(editing ? 'actualizar_proveedor' : 'crear_proveedor', args);
		if (error) {
			const message = String(error.message || '').toLowerCase();
			if (message.includes('could not find the function') || message.includes('schema cache') || isMissingModule(error)) {
				showSetupBanner();
				notify('Ejecuta la versiÃ³n actualizada de "data base pos.sql" para trabajar con proveedores.', 'error');
			} else {
				notify(error.message || 'No se pudo guardar el proveedor.', 'error');
			}
			return;
		}
		notify(editing ? 'Proveedor actualizado.' : 'Proveedor registrado.');
		resetSupplierForm();
		state.suppliersLoaded = false;
		await loadSuppliers(true);
		renderSupplierList();
	}
	function useSupplierForPurchase(supplierId) {
		const select = $('purchaseSupplier');
		if (select) select.value = String(supplierId);
		setView('purchases');
	}

	/* â”€â”€ Compras â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function fillPurchaseSuppliers() {
		const select = $('purchaseSupplier');
		if (!select) return;
		const current = select.value;
		select.innerHTML = '<option value="">Selecciona el proveedorâ€¦</option>' + state.suppliers.map(supplier => `
			<option value="${supplier.id}">${esc(supplier.nombre)}${supplier.rtn ? ` Â· RTN ${esc(supplier.rtn)}` : ''}</option>
		`).join('');
		if (current && state.suppliers.some(supplier => String(supplier.id) === current)) select.value = current;
	}
	function fillPurchaseProducts() {
		const select = $('purchaseProduct');
		if (!select) return;
		const current = select.value;
		const supplierId = Number($('purchaseSupplier')?.value || 0);
		let products = state.products.filter(product => product.activo);
		if (supplierId) {
			const related = products.filter(product => Number(product.proveedor_id) === supplierId);
			if (related.length) products = related;
		}
		select.innerHTML = '<option value="">Selecciona el productoâ€¦</option>' + products.map(product => `
			<option value="${product.id}">${esc(product.nombre)} Â· ${esc(product.categoria || 'General')}</option>
		`).join('');
		if (current && products.some(product => String(product.id) === current)) select.value = current;
	}
	async function loadPurchases(force = false) {
		if (state.loadingPurchases) return state.purchases;
		if (state.purchasesLoaded && !force) return state.purchases;
		const database = getDb();
		if (!database) return state.purchases;
		state.loadingPurchases = true;
		try {
			const { data, error } = await database
				.from('compras')
				.select('*')
				.order('fecha', { ascending: false })
				.limit(150);
			if (error) {
				if (isMissingModule(error)) {
					showSetupBanner();
					state.purchases = [];
					state.purchaseDetails = [];
					state.purchasesLoaded = false;
					return state.purchases;
				}
				notify(error.message || 'No se pudieron consultar las compras.', 'error');
				return state.purchases;
			}
			state.purchases = data || [];
			const ids = state.purchases.map(purchase => Number(purchase.id)).filter(Boolean);
			if (ids.length) {
				const result = await database.from('compra_detalle').select('*').in('compra_id', ids).limit(4000);
				state.purchaseDetails = result.error ? [] : (result.data || []);
			} else {
				state.purchaseDetails = [];
			}
			state.purchasesLoaded = true;
			return state.purchases;
		} finally {
			state.loadingPurchases = false;
		}
	}
	async function renderPurchasesView(force = false) {
		if (!isPosRole() || !$('purchasesView')) return;
		await loadProducts(force);
		await loadSuppliers(force);
		await loadPurchases(force);
		fillPurchaseProducts();
		fillPurchaseSuppliers();
		renderPurchaseItems();
		renderPurchaseList();
	}
	async function refreshPurchases() {
		state.purchasesLoaded = false;
		await renderPurchasesView(true);
	}
	function addPurchaseItem() {
		const productId = Number($('purchaseProduct')?.value || 0);
		const product = state.products.find(item => Number(item.id) === productId);
		if (!product) {
			notify('Selecciona el producto de la compra.', 'error');
			return;
		}
		const qty = round3(Number($('purchaseQty')?.value || 0));
		if (qty <= 0) {
			notify('La cantidad debe ser mayor a cero.', 'error');
			return;
		}
		const cost = round2(Number($('purchaseCost')?.value || product.costo || 0));
		const existing = state.purchaseItems.find(item => Number(item.producto_id) === productId);
		if (existing) {
			existing.cantidad = round3(existing.cantidad + qty);
			existing.costo_unitario = cost;
		} else {
			state.purchaseItems.push({
				producto_id: product.id,
				codigo: product.codigo || '',
				nombre: product.nombre,
				cantidad: qty,
				costo_unitario: cost,
				precio_venta: Number(product.precio || 0),
				impuesto_porcentaje: taxRate(product)
			});
		}
		$('purchaseQty').value = '1';
		$('purchaseCost').value = '';
		renderPurchaseItems();
	}
	function removePurchaseItem(index) {
		state.purchaseItems.splice(index, 1);
		renderPurchaseItems();
	}
	function renderPurchaseItems() {
		const target = $('purchaseItems');
		if (!target) return;
		if (!state.purchaseItems.length) {
			setEmpty(target, 'Agrega los productos que recibiste en la factura del proveedor.');
			renderPurchaseTotals();
			return;
		}
		target.innerHTML = state.purchaseItems.map((item, index) => `
			<div class="data-row purchase-row">
				<div class="row-main">
					<strong>${esc(item.nombre)}</strong>
					<p>${formatQty(item.cantidad)} Ã— ${money(item.costo_unitario)}</p>
				</div>
				<div class="row-actions">
					<span class="sale-total">${money(round2(item.cantidad * item.costo_unitario))}</span>
					<button class="button small" type="button" data-purchase-remove="${index}">Quitar</button>
				</div>
			</div>`).join('');
		renderPurchaseTotals();
	}
	function renderPurchaseTotals() {
		const target = $('purchaseTotals');
		if (!target) return;
		const gross = round2(state.purchaseItems.reduce((sum, item) => sum + item.cantidad * item.costo_unitario, 0));
		const tax = round2(state.purchaseItems.reduce((sum, item) => {
			const rate = Number(item.impuesto_porcentaje ?? DEFAULT_TAX);
			const line = item.cantidad * item.costo_unitario;
			return sum + (line - line / (1 + rate / 100));
		}, 0));
		const base = round2(gross - tax);
		target.innerHTML = `
			<div class="pos-total-row"><span>Bruto de la compra</span><strong>${money(gross)}</strong></div>
			<div class="pos-total-row"><span>Base gravable</span><strong>${money(base)}</strong></div>
			<div class="pos-total-row"><span>ISV 15% incluido</span><strong>${money(tax)}</strong></div>
			<div class="pos-total-row grand"><span>Total de la compra</span><strong>${money(gross)}</strong></div>`;
	}
	async function savePurchase() {
		if (!state.purchaseItems.length) {
			notify('Agrega al menos un producto a la compra.', 'error');
			return;
		}
		const supplierId = Number($('purchaseSupplier')?.value || 0);
		const supplier = state.suppliers.find(item => Number(item.id) === supplierId);
		if (!supplier) {
			notify('Selecciona el proveedor de la compra.', 'error');
			$('purchaseSupplier')?.focus();
			return;
		}
		const database = await ensureWritable();
		if (!database) return;
		const items = state.purchaseItems.map(item => ({
			producto_id: Number(item.producto_id),
			cantidad: round3(item.cantidad),
			costo_unitario: round2(item.costo_unitario),
			precio_venta: round2(item.precio_venta || 0)
		}));
		const { data, error } = await database.rpc('crear_compra', {
			p_proveedor_id: supplier.id,
			p_proveedor_nombre: supplier.nombre,
			p_items: items,
			p_nota: String($('purchaseNote')?.value || '').trim()
		});
		if (error) {
			const message = String(error.message || '').toLowerCase();
			if (message.includes('could not find the function') || message.includes('schema cache') || isMissingModule(error)) {
				showSetupBanner();
				notify('Ejecuta la versiÃ³n actualizada de "data base pos.sql" para registrar compras.', 'error');
			} else {
				notify(error.message || 'No se pudo registrar la compra.', 'error');
			}
			return;
		}
		const numero = data?.numero_compra ? `#${String(data.numero_compra).padStart(6, '0')}` : '';
		notify(`Compra ${numero} registrada. El stock ya estÃ¡ actualizado.`);
		state.purchaseItems = [];
		$('purchaseNote').value = '';
		state.purchasesLoaded = false;
		state.productsLoaded = false;
		await loadProducts(true);
		await loadPurchases(true);
		fillPurchaseProducts();
		renderPurchaseItems();
		renderPurchaseList();
	}
	function clearPurchase() {
		state.purchaseItems = [];
		$('purchaseNote').value = '';
		$('purchaseQty').value = '1';
		$('purchaseCost').value = '';
		renderPurchaseItems();
	}
	function renderPurchaseList() {
		const list = $('purchaseList');
		const count = $('purchaseCount');
		if (!list) return;
		if (count) count.textContent = `${state.purchases.length} compra${state.purchases.length === 1 ? '' : 's'}`;
		if (!state.purchases.length) {
			setEmpty(list, state.setupMissing
				? 'El mÃ³dulo de compras todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
				: 'TodavÃ­a no hay compras registradas.');
			return;
		}
		list.innerHTML = state.purchases.map(purchase => {
			const details = state.purchaseDetails.filter(detail => Number(detail.compra_id) === Number(purchase.id));
			const products = details.map(detail => `${esc(detail.nombre)} (${formatQty(detail.cantidad)})`).join(' Â· ');
			return `
				<div class="data-row purchase-row">
					<div class="row-main">
						<strong>Compra #${String(purchase.numero_compra).padStart(6, '0')} Â· ${esc(purchase.proveedor_nombre)}</strong>
						<p>${esc(formatDateTime(purchase.fecha))} Â· ${esc(purchase.usuario_nombre || 'â€”')}${purchase.proveedor_rtn ? ` Â· RTN ${esc(purchase.proveedor_rtn)}` : ''}</p>
						${products ? `<p class="purchase-detail">${products}</p>` : ''}
					</div>
					<div class="row-actions">
						<span class="sale-total">${money(purchase.total)}</span>
					</div>
				</div>`;
		}).join('');
	}

	/* â”€â”€ Caja: apertura y cierre â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadCash(force = false) {
		if (state.cashLoaded && !force) return state.cash;
		const database = getDb();
		if (!database) return state.cash;
		const { data, error } = await database
			.from('cajas')
			.select('*')
			.order('creado_en', { ascending: false })
			.limit(60);
		if (error) {
			state.cashReady = false;
			if (isMissingModule(error)) {
				showSetupBanner();
				state.cash = [];
				state.cashLoaded = false;
				return state.cash;
			}
			notify(error.message || 'No se pudo consultar la caja.', 'error');
			return state.cash;
		}
		state.cashReady = true;
		state.cash = data || [];
		state.cashLoaded = true;
		const userId = ws().activeUserId;
		state.currentCash = state.cash.find(caja => caja.estado === 'Abierta' && (!userId || caja.usuario_id === userId))
			|| state.cash.find(caja => caja.estado === 'Abierta')
			|| null;
		return state.cash;
	}
	async function renderCashView(force = false) {
		if (!isCashRole() || !$('cashView')) return;
		await loadCash(force);
		await loadSales(force);
		renderCashForm();
		renderCashSummary();
		renderCashHistory();
		updateCashBanner();
	}
	async function refreshCash() {
		state.cashLoaded = false;
		await renderCashView(true);
	}
	function renderCashForm() {
		const open = state.currentCash;
		const title = $('cashFormTitle');
		const amountLabel = $('cashAmountLabel');
		const submit = $('cashSubmit');
		const status = $('cashStatus');
		if (title) title.textContent = open ? 'Cierre de caja' : 'Apertura de caja';
		if (amountLabel) amountLabel.textContent = open ? 'Efectivo declarado (L.)' : 'Monto inicial (L.)';
		if (submit) submit.textContent = open ? 'Cerrar caja' : 'Abrir caja';
		if (status) status.textContent = open ? `Abierta Â· ${formatDate(open.fecha)}` : 'Sin caja abierta';
		if ($('cashId')) $('cashId').value = open ? String(open.id) : '';
	}
	function renderCashSummary() {
		const target = $('cashSummary');
		if (!target) return;
		const open = state.currentCash;
		const sales = state.sales.filter(sale => sale.estado !== 'Anulada' && localDateKey(sale.fecha) === today());
		const cash = round2(sales.filter(sale => sale.metodo_pago === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const card = round2(sales.filter(sale => sale.metodo_pago === 'Tarjeta').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const transfer = round2(sales.filter(sale => sale.metodo_pago === 'Transferencia').reduce((sum, sale) => sum + Number(sale.total || 0), 0));
		const banks = new Map();
		sales.filter(sale => sale.metodo_pago === 'Tarjeta').forEach(sale => {
			const key = sale.banco || 'Sin banco';
			const current = banks.get(key) || { total: 0, count: 0 };
			current.total = round2(current.total + Number(sale.total || 0));
			current.count += 1;
			banks.set(key, current);
		});
		const initial = Number(open?.monto_inicial || 0);
		const expected = round2(initial + cash);
		const bankRows = [...banks.entries()].sort((left, right) => right[1].total - left[1].total);
		target.innerHTML = `
			<div class="cash-summary-head">
				<span>Transacciones del dÃ­a</span>
				<strong>${open ? 'Caja abierta' : 'Sin caja abierta'}</strong>
			</div>
			<div class="report-row"><div class="report-row-head"><span>Efectivo</span><strong>${money(cash)}</strong></div>
				<small>${sales.filter(sale => sale.metodo_pago === 'Efectivo').length} venta(s) en efectivo</small></div>
			<div class="report-row"><div class="report-row-head"><span>Tarjeta (POS)</span><strong>${money(card)}</strong></div>
				<small>${sales.filter(sale => sale.metodo_pago === 'Tarjeta').length} cobro(s) con tarjeta</small></div>
			${bankRows.map(([name, data]) => `
				<div class="report-row report-row-bank"><div class="report-row-head"><span>Â· ${esc(name)}</span><strong>${money(data.total)}</strong></div>
					<small>${data.count} cobro(s)</small></div>`).join('')}
			<div class="report-row"><div class="report-row-head"><span>Transferencia</span><strong>${money(transfer)}</strong></div>
				<small>${sales.filter(sale => sale.metodo_pago === 'Transferencia').length} venta(s)</small></div>
			<div class="report-row report-row-total"><div class="report-row-head"><span>Total vendido</span><strong>${money(round2(cash + card + transfer))}</strong></div></div>
			${open ? `<div class="report-row"><div class="report-row-head"><span>Monto inicial</span><strong>${money(initial)}</strong></div></div>
			<div class="report-row"><div class="report-row-head"><span>Efectivo esperado en caja</span><strong>${money(expected)}</strong></div>
				<small>Monto inicial + ventas en efectivo</small></div>` : ''}`;
	}
	function renderCashHistory() {
		const list = $('cashHistory');
		if (!list) return;
		if (!state.cash.length) {
			setEmpty(list, state.setupMissing
				? 'El mÃ³dulo de caja todavÃ­a no estÃ¡ activo. Ejecuta "data base pos.sql" en Supabase.'
				: 'TodavÃ­a no hay aperturas de caja registradas.');
			return;
		}
		list.innerHTML = state.cash.map(caja => {
			const banks = Object.entries(caja.por_banco || {});
			return `
				<div class="data-row cash-row">
					<div class="row-main">
						<strong>${esc(formatDate(caja.fecha))} Â· ${esc(caja.usuario_nombre || 'Usuario POS')}</strong>
						<p>Inicial ${money(caja.monto_inicial)} Â· Ventas ${money(caja.total_ventas)} Â· Efectivo ${money(caja.total_efectivo)} Â· Tarjeta ${money(caja.total_tarjeta || 0)}</p>
						${caja.estado === 'Cerrada' ? `<p class="purchase-detail">Esperado ${money(caja.monto_sistema)} Â· Declarado ${money(caja.monto_declarado)} Â· Diferencia ${money(caja.diferencia)}</p>` : ''}
						${banks.length ? `<p class="purchase-detail">POS: ${banks.map(([name, data]) => `${esc(name)} ${money(data.total)}`).join(' Â· ')}</p>` : ''}
					</div>
					<div class="row-actions">
						<span class="stock-badge ${caja.estado === 'Abierta' ? 'low' : ''}">${esc(caja.estado)}</span>
					</div>
				</div>`;
		}).join('');
	}
	function updateCashBanner() {
		const banner = $('posCashBanner');
		if (!banner) return;
		if (!state.cashReady || !isCashRole()) {
			banner.hidden = true;
			return;
		}
		if (state.currentCash) {
			banner.hidden = true;
			return;
		}
		banner.hidden = false;
		const text = $('posCashBannerText');
		if (text) text.textContent = 'No tienes una caja abierta. Abre tu caja para iniciar el dÃ­a.';
	}
	async function openCash() {
		const amount = round2(Number($('cashAmount')?.value || 0));
		const note = String($('cashNote')?.value || '').trim();
		const database = await ensureWritable();
		if (!database) return;
		const { error } = await database.rpc('abrir_caja', { p_monto_inicial: amount, p_notas: note });
		if (error) {
			notify(error.message || 'No se pudo abrir la caja.', 'error');
			return;
		}
		notify('Caja abierta. Ya puedes registrar ventas.');
		$('cashNote').value = '';
		state.cashLoaded = false;
		await renderCashView(true);
	}
	async function closeCash() {
		const caja = state.currentCash;
		if (!caja) {
			notify('No tienes una caja abierta.', 'error');
			return;
		}
		const amount = round2(Number($('cashAmount')?.value || 0));
		const note = String($('cashNote')?.value || '').trim();
		const database = await ensureWritable();
		if (!database) return;
		const { error } = await database.rpc('cerrar_caja', {
			p_caja_id: Number(caja.id),
			p_monto_declarado: amount,
			p_notas: note
		});
		if (error) {
			notify(error.message || 'No se pudo cerrar la caja.', 'error');
			return;
		}
		notify('Caja cerrada. El resumen quedÃ³ guardado.');
		$('cashNote').value = '';
		$('cashAmount').value = '0';
		state.cashLoaded = false;
		await renderCashView(true);
	}
	async function submitCash() {
		if (state.currentCash) await closeCash();
		else await openCash();
	}

	/* â”€â”€ Usuarios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	async function loadUsers(force = false) {
		if (state.usersLoaded && !force) return state.users;
		const database = getDb();
		if (!database) return state.users;
		const { data, error } = await database.rpc('admin_listar_usuarios');
		if (error) {
			state.users = [];
			return state.users;
		}
		state.users = data || [];
		state.usersLoaded = true;
		return state.users;
	}
	async function renderUsersView(force = false) {
		if (!isSupervisorRole() || !$('usersView')) return;
		await loadUsers(force);
		renderUserList();
	}
	async function refreshUsers() {
		state.usersLoaded = false;
		await renderUsersView(true);
	}
	function renderUserList() {
		const list = $('userList');
		const count = $('userCount');
		if (!list) return;
		if (count) count.textContent = `${state.users.length} usuario${state.users.length === 1 ? '' : 's'}`;
		if (!state.users.length) {
			setEmpty(list, 'No hay usuarios autorizados. Crea las cuentas en Supabase y agrÃ©galas aquÃ­.');
			return;
		}
		list.innerHTML = state.users.map(user => `
			<div class="data-row customer-row">
				<div class="row-main">
					<strong>${esc(user.username)}</strong>
					<p>${esc(roleLabel(user.role))}${user.active ? '' : ' Â· Inactivo'}</p>
				</div>
				<div class="row-actions">
					<button class="button small" type="button" data-user-edit="${esc(user.username)}">Editar</button>
				</div>
			</div>`).join('');
	}
	async function saveUser() {
		const form = $('userForm');
		if (!form || !form.reportValidity()) return;
		const username = String($('userName').value || '').trim().toLowerCase();
		const role = $('userRole')?.value || 'vendedor';
		const active = ($('userActive')?.value || 'true') === 'true';
		const database = await ensureWritable();
		if (!database) return;
		const { error } = await database.rpc('admin_guardar_usuario', {
			p_username: username,
			p_role: role,
			p_active: active
		});
		if (error) {
			notify(error.message || 'No se pudo guardar el usuario.', 'error');
			return;
		}
		notify(`Usuario ${username} guardado con el rol ${roleLabel(role)}.`);
		state.usersLoaded = false;
		await renderUsersView(true);
	}
	function editUser(username) {
		const user = state.users.find(item => item.username === username);
		if (!user) return;
		$('userName').value = user.username || '';
		$('userRole').value = user.role || 'vendedor';
		$('userActive').value = user.active ? 'true' : 'false';
		$('userName').focus();
	}

	/* â”€â”€ Registro rÃ¡pido de cliente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	function openQuickClient() {
		const modal = $('quickClientModal');
		if (modal) modal.hidden = false;
		$('quickClientName')?.focus();
	}
	function closeQuickClient() {
		const modal = $('quickClientModal');
		if (modal) modal.hidden = true;
		['quickClientName', 'quickClientRtn', 'quickClientPhone', 'quickClientEmail', 'quickClientIdentity', 'quickClientAddress'].forEach(id => {
			const field = $(id);
			if (field) field.value = '';
		});
	}
	async function saveQuickClient() {
		const form = $('quickClientForm');
		if (!form || !form.reportValidity()) return;
		const name = String($('quickClientName').value || '').trim();
		const rtn = normalizeRtn($('quickClientRtn').value);
		if (!name) {
			notify('Escribe el nombre o la razÃ³n social del cliente.', 'error');
			$('quickClientName').focus();
			return;
		}
		if (rtn && rtn.length !== 14) {
			notify('El RTN debe tener exactamente 14 dÃ­gitos.', 'error');
			$('quickClientRtn').focus();
			return;
		}
		const database = await ensureWritable();
		if (!database) return;
		const { data, error } = await database.rpc('crear_cliente', {
			p_nombre: name,
			p_telefono: String($('quickClientPhone').value || '').trim(),
			p_correo: String($('quickClientEmail').value || '').trim(),
			p_identidad: String($('quickClientIdentity').value || '').trim(),
			p_direccion: String($('quickClientAddress').value || '').trim(),
			p_rtn: rtn
		});
		if (error) {
			const message = String(error.message || '').toLowerCase();
			if (message.includes('could not find the function') || message.includes('schema cache') || isMissingModule(error)) {
				showSetupBanner();
				notify('Ejecuta la versiÃ³n actualizada de "data base pos.sql" para registrar clientes con RTN.', 'error');
			} else {
				notify(error.message || 'No se pudo registrar el cliente.', 'error');
			}
			return;
		}
		notify(`Cliente ${name} registrado.`);
		closeQuickClient();
		state.customersLoaded = false;
		await loadCustomers(true);
		const select = $('posCustomer');
		if (select && data?.id) select.value = String(data.id);
		updateCustomerTax();
	}

	/* â”€â”€ API pÃºblica para Recibo.html â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
	window.WSApp.renderPOS = renderPOS;
	window.WSApp.refreshPOS = refreshPOS;
	window.WSApp.renderProductsView = renderProductsView;
	window.WSApp.refreshProducts = () => renderProductsView(true);
	window.WSApp.renderSalesView = renderSalesView;
	window.WSApp.refreshSales = () => renderSalesView(true);
	window.WSApp.renderDashboard = renderDashboardView;
	window.WSApp.refreshDashboard = refreshDashboard;
	window.WSApp.renderInventoryView = renderInventoryView;
	window.WSApp.refreshInventory = refreshInventory;
	window.WSApp.renderCustomersView = renderCustomersView;
	window.WSApp.refreshCustomers = refreshCustomers;
	window.WSApp.renderReportsView = renderReportsView;
	window.WSApp.refreshReports = refreshReports;
	window.WSApp.renderSettingsView = renderSettingsView;
	window.WSApp.renderSuppliersView = renderSuppliersView;
	window.WSApp.refreshSuppliers = refreshSuppliers;
	window.WSApp.renderPurchasesView = renderPurchasesView;
	window.WSApp.refreshPurchases = refreshPurchases;
	window.WSApp.renderCashView = renderCashView;
	window.WSApp.refreshCash = refreshCash;
	window.WSApp.renderUsersView = renderUsersView;
	window.WSApp.refreshUsers = refreshUsers;

	

/* â”€â”€ Formulario de ConfiguraciÃ³n Unificado: Empresa + CAI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
class ConfigForm {
    constructor() {
        this.modal = $('configModal');
        this.form = $('configForm');
        this.init();
    }
    init() {
        if (!this.modal || !this.form) return;
        this.form.addEventListener('submit', e => this.handleSave(e));
        const updateBtn = $('configUpdateBtn');
        if (updateBtn) updateBtn.addEventListener('click', () => this.loadConfig());
        const resetBtn = $('configResetBtn');
        if (resetBtn) resetBtn.addEventListener('click', () => this.resetDefaults());
        const cancelBtn = $('configCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());
        const closeBtn = this.modal.querySelector('.modal-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    }
    open() {
        this.loadConfig();
        this.modal.hidden = false;
        this.form.querySelector('input, select')?.focus();
    }
    async loadConfig() {
        // 1. Cargar settings de localStorage (empresa, facturaciÃ³n)
        const settings = loadSettings();
        this.populate(settings);
        // 2. Cargar CAI desde Supabase
        await this.loadCai();
        notify('ConfiguraciÃ³n cargada.');
    }
    async loadCai() {
        const database = getDb();
        if (!database) return;
        try {
            const { data, error } = await database
                .from('configuracion_cai')
                .select('*')
                .eq('activo', true)
                .order('creado_en', { ascending: false })
                .limit(1);
            if (!error && data && data.length > 0) {
                const cai = data[0];
                this.populate({
                    cai: cai.cai,
                    caiRtn: cai.rtn_emisor,
                    caiTipo: cai.tipo_documento || '01',
                    caiEstablecimiento: cai.establecimiento || '001',
                    caiPunto: cai.punto_emision || '001',
                    caiDesde: cai.correlativo_inicio || 1,
                    caiHasta: cai.correlativo_fin || 8000,
                    caiFechaLimite: cai.fecha_limite ? cai.fecha_limite.split('T')[0] : '',
                    caiActivo: String(cai.activo),
                    caiNegocio: cai.nombre_negocio || '',
                    caiDireccion: cai.direccion || '',
                    caiTelefono: cai.telefono || '',
                    caiPie: cai.pie_factura || ''
                });
            }
        } catch (err) {
            console.warn('No se pudo cargar CAI:', err);
        }
    }
    populate(data) {
        if (!this.form) return;
        Object.keys(data).forEach(key => {
            const input = this.form.querySelector('[name="' + key + '"]');
            if (input) {
                if (input.type === 'checkbox') { input.checked = !!data[key]; }
                else { input.value = data[key] ?? ''; }
            }
        });
    }
    collect() {
        if (!this.form) return null;
        const formData = new FormData(this.form);
        const data = {};
        formData.forEach((value, key) => {
            const input = this.form.querySelector('[name="' + key + '"]');
            if (input?.type === 'checkbox') { data[key] = input.checked; }
            else if (input?.type === 'number') { data[key] = value === '' ? null : Number(value); }
            else { data[key] = value; }
        });
        return data;
    }
    validate() {
        if (!this.form) return false;
        return this.form.reportValidity();
    }
    async handleSave(e) {
        e.preventDefault();
        if (!this.validate()) return;

        const data = this.collect();
        const submitBtn = $('configSaveBtn');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Guardando...'; }

        try {
            // 1. Separar datos de empresa/facturaciÃ³n (localStorage) y CAI (Supabase)
            const settingsKeys = ['negocio', 'rtn', 'telefono', 'direccion', 'correo', 'pie', 'isv', 'stockMinimo', 'moneda'];
            const caiKeys = ['cai', 'caiRtn', 'caiTipo', 'caiEstablecimiento', 'caiPunto', 'caiDesde', 'caiHasta', 'caiFechaLimite', 'caiActivo', 'caiNegocio', 'caiDireccion', 'caiTelefono', 'caiPie'];

            const settingsData = {};
            settingsKeys.forEach(k => { if (data[k] !== undefined) settingsData[k] = data[k]; });

            const caiData = {};
            caiKeys.forEach(k => { if (data[k] !== undefined) caiData[k] = data[k]; });

            // 2. Guardar settings en localStorage
            persistSettings(settingsData);
            state.settings = { ...DEFAULT_SETTINGS, ...settingsData };

            // 3. Guardar CAI en Supabase
            await this.saveCai(caiData);

            notify('ConfiguraciÃ³n guardada correctamente.');
            this.close();
        } catch (error) {
            notify(error.message || 'Error al guardar.', 'error');
        } finally {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Guardar todo'; }
        }
    }
    async saveCai(caiData) {
        const database = await ensureWritable();
        if (!database) return;

        // Mapear campos del formulario a la tabla configuracion_cai
        const payload = {
            p_cai: caiData.cai || '',
            p_rtn_emisor: caiData.caiRtn || '',
            p_tipo_documento: caiData.caiTipo || '01',
            p_establecimiento: caiData.caiEstablecimiento || '001',
            p_punto_emision: caiData.caiPunto || '001',
            p_correlativo_inicio: Number(caiData.caiDesde) || 1,
            p_correlativo_fin: Number(caiData.caiHasta) || 8000,
            p_fecha_limite: caiData.caiFechaLimite ? new Date(caiData.caiFechaLimite + 'T00:00:00').toISOString() : null,
            p_activo: caiData.caiActivo === 'true',
            p_nombre_negocio: caiData.caiNegocio || '',
            p_direccion: caiData.caiDireccion || '',
            p_telefono: caiData.caiTelefono || '',
            p_pie_factura: caiData.caiPie || ''
        };

        // Usar RPC para crear/actualizar CAI
        const { error } = await database.rpc('crear_o_actualizar_cai', payload);
        if (error) {
            // Si no existe la RPC, intentar insert directo
            if (error.message?.includes('function') || error.message?.includes('RPC')) {
                // Desactivar otros CAI activos
                await database.from('configuracion_cai').update({ activo: false }).eq('activo', true);
                // Insertar nuevo
                const { error: insError } = await database.from('configuracion_cai').insert({
                    cai: payload.p_cai,
                    rtn_emisor: payload.p_rtn_emisor,
                    tipo_documento: payload.p_tipo_documento,
                    establecimiento: payload.p_establecimiento,
                    punto_emision: payload.p_punto_emision,
                    correlativo_inicio: payload.p_correlativo_inicio,
                    correlativo_fin: payload.p_correlativo_fin,
                    correlativo_actual: payload.p_correlativo_inicio - 1,
                    fecha_limite: payload.p_fecha_limite,
                    activo: payload.p_activo,
                    nombre_negocio: payload.p_nombre_negocio,
                    direccion: payload.p_direccion,
                    telefono: payload.p_telefono,
                    pie_factura: payload.p_pie_factura
                });
                if (insError) throw insError;
            } else {
                throw error;
            }
        }
        // Recargar CAI activo
        await loadActiveCai();
    }
    resetDefaults() {
        if (!confirm('Â¿Restaurar valores por defecto? Se perderÃ¡n los cambios actuales.')) return;
        this.populate(DEFAULT_SETTINGS);
        notify('Valores por defecto cargados. Presiona "Guardar todo" para confirmar.');
    }
    close() {
        this.modal.hidden = true;
    }
}
const configForm = new ConfigForm();
window.WSApp.openConfigForm = () => configForm.open();
window.WSApp.configForm = configForm;

function init() {
		if (!$('posView')) return;
		initSalesDates();
		initReportsDates();
		bindEvents();
		renderCategoryOptions();
		updateDocumentTypeUi();
		startAutoRefresh();
		if (!$('dashboardView').hidden) void renderDashboardView();
		if (!$('posView').hidden) void renderPOS();
		if (!$('productsView').hidden) void renderProductsView();
		if (!$('salesView').hidden) void renderSalesView();
		if (!$('inventoryView').hidden) void renderInventoryView();
		if (!$('customersView').hidden) void renderCustomersView();
		if (!$('reportsView').hidden) void renderReportsView();
		if (!$('settingsView').hidden) renderSettingsView();
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
	else init();
})();
