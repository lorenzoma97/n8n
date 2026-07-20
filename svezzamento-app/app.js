/* ============================================================
   Svezzamento — logica applicativa (vanilla JS, no dipendenze)
   Persistenza: localStorage. Nessun backend.
   ============================================================ */
(function () {
	'use strict';

	const D = window.SVEZZAMENTO_DATA;
	const STORAGE_KEY = 'svezzamento.v1';
	const TOTAL_DAYS = D.GIORNI.length;

	/* ---------------- Stato ---------------- */
	const defaultState = () => ({
		startDate: null, // ISO 'YYYY-MM-DD' del giorno 1
		days: {}, // { [n]: { meals:{}, rules:{}, note:'' } }
		allergens: {}, // { [id]: { somministrato, reazione, note } }
		selectedDay: null,
	});

	let state = load();

	function load() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return defaultState();
			return Object.assign(defaultState(), JSON.parse(raw));
		} catch (e) {
			return defaultState();
		}
	}

	function save() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		} catch (e) {
			/* storage pieno o disabilitato: l'app resta usabile in memoria */
		}
	}

	function dayState(n) {
		if (!state.days[n]) state.days[n] = { meals: {}, rules: {}, note: '' };
		if (!state.days[n].meals) state.days[n].meals = {};
		if (!state.days[n].rules) state.days[n].rules = {};
		return state.days[n];
	}

	/* ---------------- Date helpers ---------------- */
	function parseISO(iso) {
		if (!iso) return null;
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d);
	}
	function toISO(date) {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	function todayMidnight() {
		const t = new Date();
		return new Date(t.getFullYear(), t.getMonth(), t.getDate());
	}
	function dateForDay(n) {
		const start = parseISO(state.startDate);
		if (!start) return null;
		const dt = new Date(start);
		dt.setDate(dt.getDate() + (n - 1));
		return dt;
	}
	function formatDate(date) {
		if (!date) return '';
		return date.toLocaleDateString('it-IT', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
		});
	}
	function formatDateShort(date) {
		if (!date) return '';
		return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
	}
	/* Numero del giorno-programma corrispondente a oggi (o null se fuori intervallo) */
	function currentDayNumber() {
		const start = parseISO(state.startDate);
		if (!start) return null;
		const diff = Math.round((todayMidnight() - start) / 86400000);
		const n = diff + 1;
		if (n < 1 || n > TOTAL_DAYS) return null;
		return n;
	}

	/* ---------------- Progress ---------------- */
	function mealKeys(g) {
		return D.PASTI_ORDINE.filter((p) => g.pasti[p.id]).map((p) => p.id);
	}
	function dayProgress(n) {
		const g = D.GIORNI[n - 1];
		const ds = dayState(n);
		const keys = mealKeys(g);
		const total = keys.length + D.REGOLE_FISSE.length;
		let done = 0;
		keys.forEach((k) => ds.meals[k] && done++);
		D.REGOLE_FISSE.forEach((r) => ds.rules[r.id] && done++);
		return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
	}
	function dayComplete(n) {
		const p = dayProgress(n);
		return p.total > 0 && p.done === p.total;
	}

	/* ---------------- DOM helpers ---------------- */
	function el(tag, attrs, children) {
		const node = document.createElement(tag);
		if (attrs) {
			for (const k in attrs) {
				if (k === 'class') node.className = attrs[k];
				else if (k === 'html') node.innerHTML = attrs[k];
				else if (k.startsWith('on') && typeof attrs[k] === 'function') {
					node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
				} else if (attrs[k] != null) node.setAttribute(k, attrs[k]);
			}
		}
		(children || []).forEach((c) => {
			if (c == null) return;
			node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
		});
		return node;
	}
	const CHECK_SVG =
		'<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="4 12 10 18 20 6"></polyline></svg>';

	function allergenBadges(g) {
		return g.allergeni.map((a) => {
			const cls = a.tipo === 'mantenimento' ? 'badge--maint' : 'badge--allergen';
			const label = a.tipo === 'mantenimento' ? a.nome : a.nome.toUpperCase();
			return el('span', { class: `badge ${cls}` }, [
				a.tipo === 'mantenimento' ? '↻ ' + label : '⚠ ' + label,
			]);
		});
	}

	/* ---------------- Router ---------------- */
	const views = ['oggi', 'calendario', 'allergeni', 'guida', 'giorno'];
	let currentView = 'oggi';

	function navigate(view, opts) {
		currentView = view;
		if (opts && opts.day) state.selectedDay = opts.day;
		views.forEach((v) => {
			const node = document.getElementById('view-' + v);
			if (node) node.hidden = v !== view;
		});
		document.querySelectorAll('.nav__btn').forEach((b) => {
			const active = b.dataset.view === view || (view === 'giorno' && b.dataset.view === 'calendario');
			if (active) b.setAttribute('aria-current', 'page');
			else b.removeAttribute('aria-current');
		});
		render();
		window.scrollTo({ top: 0, behavior: 'auto' });
	}

	/* ---------------- Render: OGGI ---------------- */
	function renderOggi() {
		const root = document.getElementById('view-oggi');
		root.innerHTML = '';

		if (!state.startDate) {
			root.appendChild(renderSetup());
			return;
		}

		const n = currentDayNumber();
		if (n == null) {
			root.appendChild(renderOutOfRange());
			return;
		}
		root.appendChild(renderDayContent(n, { hero: true }));
	}

	function renderSetup() {
		const input = el('input', { type: 'date', id: 'start-input' });
		const wrap = el('div', { class: 'card' }, [
			el('h2', { style: 'font-size:18px;margin-bottom:8px;' }, ['👋 Benvenuta']),
			el('p', { class: 'muted', style: 'margin-top:0;margin-bottom:16px;' }, [
				'Imposta il giorno in cui inizi (o hai iniziato) lo svezzamento: giorno 1 del calendario. L\'app calcolerà automaticamente a che giorno sei e mostrerà il piano corretto ogni giorno.',
			]),
			el('div', { class: 'field' }, [
				el('label', { for: 'start-input' }, ['Data di inizio (Giorno 1)']),
				input,
			]),
			el(
				'button',
				{
					class: 'btn btn--block',
					onClick: () => {
						const v = input.value || toISO(todayMidnight());
						state.startDate = v;
						save();
						navigate('oggi');
					},
				},
				['Inizia'],
			),
			el('p', { class: 'tiny', style: 'margin-top:12px;text-align:center;' }, [
				'Se lasci vuoto, parte da oggi.',
			]),
		]);
		input.value = toISO(todayMidnight());
		return wrap;
	}

	function renderOutOfRange() {
		const n = currentDayNumber.__lastComputedNull; // not used; compute explicitly
		const start = parseISO(state.startDate);
		const diff = Math.round((todayMidnight() - start) / 86400000) + 1;
		const notStarted = diff < 1;
		const finished = diff > TOTAL_DAYS;
		const card = el('div', { class: 'card' }, [
			el('h2', { style: 'font-size:18px;margin-bottom:8px;' }, [
				notStarted ? '⏳ Non ancora iniziato' : '🎉 Programma completato',
			]),
			el('p', { class: 'muted' }, [
				notStarted
					? `Il Giorno 1 è previsto per ${formatDate(start)}. Nel frattempo puoi consultare il calendario e la guida.`
					: `Hai completato i ${TOTAL_DAYS} giorni del 1° mese. Prosegui i mantenimenti (uovo, pesce, arachide, legumi) e programma il controllo Hb/ferritina col pediatra.`,
			]),
			el('div', { class: 'btn-row', style: 'margin-top:12px;' }, [
				el('button', { class: 'btn', onClick: () => navigate('calendario') }, ['Vai al calendario']),
				el(
					'button',
					{ class: 'btn btn--ghost', onClick: () => changeStartDate() },
					['Cambia data di inizio'],
				),
			]),
		]);
		return card;
	}

	function changeStartDate() {
		const cur = state.startDate || toISO(todayMidnight());
		const v = window.prompt('Data di inizio (Giorno 1) in formato AAAA-MM-GG:', cur);
		if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
			state.startDate = v;
			save();
			render();
			navigate(currentView);
		}
	}

	/* Contenuto completo di un giorno (usato in Oggi e nel dettaglio) */
	function renderDayContent(n, opts) {
		opts = opts || {};
		const g = D.GIORNI[n - 1];
		const ds = dayState(n);
		const date = dateForDay(n);
		const prog = dayProgress(n);
		const frag = document.createDocumentFragment();

		/* Hero (solo in vista Oggi) */
		if (opts.hero) {
			const hero = el('div', { class: 'hero' }, [
				el('div', { class: 'hero__eyebrow' }, ['Oggi']),
				el('div', { class: 'hero__day' }, [`Giorno ${n}`]),
				el('div', { class: 'hero__date' }, [
					formatDate(date).charAt(0).toUpperCase() + formatDate(date).slice(1),
				]),
				el('div', { class: 'hero__meta' }, [
					el('span', { class: 'badge' }, [`Settimana ${g.settimana}`]),
					...(g.nuovo ? [el('span', { class: 'badge' }, ['✨ ' + g.nuovo])] : []),
				]),
				el('div', { class: 'hero__progress progress-row' }, [
					el('div', { class: 'bar' }, [el('span', { style: `width:${prog.pct}%` })]),
					el('span', { class: 'label' }, [`${prog.pct}%`]),
				]),
			]);
			frag.appendChild(hero);
		}

		/* Avviso allergene con osservazione */
		const osserva = g.allergeni.filter((a) => a.osserva);
		if (osserva.length) {
			osserva.forEach((a) => {
				frag.appendChild(renderAllergenAlert(n, a));
			});
		}

		/* Nota del giorno (informativa) */
		if (g.nota) {
			frag.appendChild(
				el('div', { class: 'callout callout--gold' }, [
					el('div', { html: '💡 ' + g.nota }),
				]),
			);
		}

		/* Pasti */
		frag.appendChild(el('div', { class: 'section-title' }, ['Pasti del giorno']));
		const mealsCard = el('div', { class: 'card', style: 'padding:6px;' });
		D.PASTI_ORDINE.forEach((p) => {
			const testo = g.pasti[p.id];
			if (!testo) return;
			const checked = !!ds.meals[p.id];
			const allergOfMeal = g.allergeni.filter((a) => a.momento === p.id);
			const row = el(
				'div',
				{
					class: 'check',
					role: 'checkbox',
					'aria-checked': String(checked),
					tabindex: '0',
					'data-checked': String(checked),
					onClick: () => toggleMeal(n, p.id),
					onKeydown: (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							toggleMeal(n, p.id);
						}
					},
				},
				[
					el('span', { class: 'check__box', html: CHECK_SVG }),
					el('div', { class: 'check__main' }, [
						el('div', { class: 'check__title' }, [
							el('span', { class: 'emoji' }, [p.emoji]),
							el('span', { class: 'meal-momento' }, [p.label]),
							...allergOfMeal.map((a) =>
								el(
									'span',
									{
										class:
											'badge ' +
											(a.tipo === 'mantenimento' ? 'badge--maint' : 'badge--allergen'),
									},
									[(a.tipo === 'mantenimento' ? '↻ ' : '⚠ ') + a.nome],
								),
							),
						]),
						el('div', { class: 'check__desc' }, [testo]),
					]),
				],
			);
			mealsCard.appendChild(row);
		});
		frag.appendChild(mealsCard);

		/* Regole fisse */
		frag.appendChild(el('div', { class: 'section-title' }, ['Regole fisse di ogni giorno']));
		const rulesCard = el('div', { class: 'card', style: 'padding:6px;' });
		D.REGOLE_FISSE.forEach((r) => {
			const checked = !!ds.rules[r.id];
			const row = el(
				'div',
				{
					class: 'check',
					role: 'checkbox',
					'aria-checked': String(checked),
					tabindex: '0',
					'data-checked': String(checked),
					onClick: () => toggleRule(n, r.id),
					onKeydown: (e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							toggleRule(n, r.id);
						}
					},
				},
				[
					el('span', { class: 'check__box', html: CHECK_SVG }),
					el('div', { class: 'check__main' }, [
						el('div', { class: 'check__title' }, [
							el('span', { class: 'emoji' }, [r.icona]),
							r.titolo,
						]),
						el('div', { class: 'check__desc' }, [r.dettaglio]),
					]),
				],
			);
			rulesCard.appendChild(row);
		});
		frag.appendChild(rulesCard);

		/* Nota personale */
		frag.appendChild(el('div', { class: 'section-title' }, ['Le mie note']));
		const ta = el('textarea', {
			class: 'note-field',
			placeholder: 'Come è andata? Quanto ha mangiato, gradimento, osservazioni…',
		});
		ta.value = ds.note || '';
		ta.addEventListener('input', () => {
			ds.note = ta.value;
			save();
		});
		frag.appendChild(el('div', { class: 'card' }, [ta]));

		return frag;
	}

	function renderAllergenAlert(n, a) {
		const id = `${a.nome}-g${n}`;
		const log = state.allergens[id] || {};
		const wrap = el('div', { class: 'alert alert--warn' });
		wrap.appendChild(
			el('div', { class: 'alert__head' }, [`⚠️ Allergene al mattino: ${a.nome}`]),
		);
		wrap.appendChild(
			el('div', { class: 'alert__body' }, [
				a.tipo === 'escalation'
					? 'Aumento della dose. Somministra al mattino e osserva 2-3 ore (orticaria, gonfiore labbra/volto, vomito, difficoltà respiratoria).'
					: 'Nuovo allergene: somministra al mattino, in giornata tranquilla, e osserva 2-3 ore. Un solo alimento nuovo per volta.',
			]),
		);
		wrap.appendChild(renderAllergenLog(id, a.nome));
		return wrap;
	}

	/* Widget di log reazione riutilizzabile */
	function renderAllergenLog(id, nome) {
		const log = state.allergens[id] || {};
		const setReaction = (val) => {
			state.allergens[id] = Object.assign({}, state.allergens[id], {
				somministrato: true,
				reazione: val,
			});
			save();
			render();
		};
		const opt = (val, cls, label) =>
			el(
				'button',
				{
					class: cls,
					'aria-pressed': String(log.reazione === val),
					onClick: () => setReaction(val),
				},
				[label],
			);
		return el('div', { class: 'allergen-item__log' }, [
			el('span', { class: 'tiny', style: 'font-weight:700;' }, ['Reazione:']),
			el('div', { class: 'chip-select' }, [
				opt('nessuna', 'ok', '✅ Nessuna'),
				opt('lieve', 'mild', '⚠️ Lieve'),
				opt('grave', 'bad', '🚨 Grave'),
			]),
		]);
	}

	function toggleMeal(n, key) {
		const ds = dayState(n);
		ds.meals[key] = !ds.meals[key];
		save();
		render();
	}
	function toggleRule(n, key) {
		const ds = dayState(n);
		ds.rules[key] = !ds.rules[key];
		save();
		render();
	}

	/* ---------------- Render: CALENDARIO ---------------- */
	function renderCalendario() {
		const root = document.getElementById('view-calendario');
		root.innerHTML = '';

		/* Barra di riepilogo */
		let completed = 0;
		for (let i = 1; i <= TOTAL_DAYS; i++) if (dayComplete(i)) completed++;
		const pct = Math.round((completed / TOTAL_DAYS) * 100);
		root.appendChild(
			el('div', { class: 'card' }, [
				el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;' }, [
					el('strong', {}, ['Avanzamento generale']),
					el('span', { class: 'muted' }, [`${completed}/${TOTAL_DAYS} giorni`]),
				]),
				el('div', { class: 'progress-row' }, [
					el('div', { class: 'bar' }, [el('span', { style: `width:${pct}%` })]),
					el('span', { class: 'label' }, [`${pct}%`]),
				]),
				state.startDate
					? el('div', { class: 'btn-row', style: 'margin-top:12px;' }, [
							el('button', { class: 'btn btn--ghost', onClick: () => changeStartDate() }, [
								'Cambia data di inizio',
							]),
					  ])
					: el('div', { class: 'btn-row', style: 'margin-top:12px;' }, [
							el('button', { class: 'btn', onClick: () => navigate('oggi') }, [
								'Imposta data di inizio',
							]),
					  ]),
			]),
		);

		const todayN = currentDayNumber();
		const weeks = [1, 2, 3, 4];
		weeks.forEach((w) => {
			const daysOfWeek = D.GIORNI.filter((g) => g.settimana === w);
			const titles = {
				1: 'Avvio, pranzo unico',
				2: 'Consolida pranzo · Uovo, poi Pesce',
				3: 'Glutine · Legumi · mantenimento',
				4: 'Arachide · 2ª pappa opzionale',
			};
			const grid = el('div', { class: 'day-grid' });
			daysOfWeek.forEach((g) => {
				const n = g.giorno;
				const complete = dayComplete(n);
				const date = dateForDay(n);
				const summary = g.pasti.pranzo || g.pasti.mattino || '';
				const card = el(
					'button',
					{
						class: 'day-card',
						'data-today': String(n === todayN),
						'data-complete': String(complete),
						onClick: () => navigate('giorno', { day: n }),
					},
					[
						el('div', { class: 'day-card__top' }, [
							el('div', { class: 'day-card__num' }, [
								`G${n} `,
								date ? el('small', {}, [formatDateShort(date)]) : null,
							]),
							complete ? el('span', { class: 'badge badge--done' }, ['✓']) : null,
						]),
						g.nuovo || g.allergeni.length
							? el('div', { class: 'day-card__badges' }, [
									...(g.nuovo ? [el('span', { class: 'badge badge--new' }, ['✨ ' + g.nuovo])] : []),
									...allergenBadges(g),
							  ])
							: null,
						el('div', { class: 'day-card__summary' }, [summary]),
						el('div', { class: 'day-card__status' }, [
							el('span', { class: 'dot' }),
							complete ? 'Completato' : n === todayN ? 'Oggi' : 'Da fare',
						]),
					],
				);
				grid.appendChild(card);
			});
			root.appendChild(
				el('div', { class: 'week-block' }, [
					el('div', { class: 'week-head' }, [
						el('h3', {}, [`Settimana ${w}`]),
						el('span', { class: 'sub' }, [titles[w]]),
					]),
					grid,
				]),
			);
		});
	}

	/* ---------------- Render: DETTAGLIO GIORNO ---------------- */
	function renderGiorno() {
		const root = document.getElementById('view-giorno');
		root.innerHTML = '';
		const n = state.selectedDay || 1;
		const g = D.GIORNI[n - 1];
		const date = dateForDay(n);

		const head = el('div', { class: 'detail-head' }, [
			el('button', { class: 'icon-btn', title: 'Torna al calendario', onClick: () => navigate('calendario') }, ['←']),
			el('div', { class: 'detail-head__title' }, [
				el('h2', {}, [`Giorno ${n}`]),
				el('div', { class: 'sub' }, [
					`Settimana ${g.settimana}${date ? ' · ' + formatDate(date) : ''}`,
				]),
			]),
			el('button', {
				class: 'icon-btn',
				title: 'Giorno precedente',
				disabled: n <= 1 ? 'disabled' : null,
				onClick: () => n > 1 && navigate('giorno', { day: n - 1 }),
			}, ['‹']),
			el('button', {
				class: 'icon-btn',
				title: 'Giorno successivo',
				disabled: n >= TOTAL_DAYS ? 'disabled' : null,
				onClick: () => n < TOTAL_DAYS && navigate('giorno', { day: n + 1 }),
			}, ['›']),
		]);
		root.appendChild(head);
		root.appendChild(renderDayContent(n, { hero: false }));
	}

	/* ---------------- Render: ALLERGENI ---------------- */
	function renderAllergeni() {
		const root = document.getElementById('view-allergeni');
		root.innerHTML = '';

		/* Regola d'oro spaziatura */
		root.appendChild(
			el('div', { class: 'callout callout--gold' }, [
				el('h3', {}, ['🕐 Regola della spaziatura']),
				el('div', {}, [
					'Allergeni SEMPRE al mattino, in giorno tranquillo, osservando 2-3 ore. Mai due allergeni nuovi lo stesso giorno; lascia ≥48-72h tra un allergene nuovo e il successivo.',
				]),
			]),
		);

		/* Elenco allergeni con stato introduzione */
		root.appendChild(el('div', { class: 'section-title' }, ['Allergeni e stato']));
		const card = el('div', { class: 'card' });
		D.ALLERGENI_RIEPILOGO.forEach((a) => {
			const introDay = a.prima;
			const introId = introDayAllergenId(a.nome, introDay);
			const log = introId ? state.allergens[introId] : null;
			const introdotto = log && log.somministrato;
			const introDate = dateForDay(introDay);
			const stato = introdotto
				? el('span', { class: 'badge badge--done' }, [
						reactionLabel(log.reazione) || '✓ Introdotto',
				  ])
				: el('span', { class: 'badge badge--week' }, ['Da introdurre']);

			const item = el('div', { class: 'allergen-item' }, [
				el('div', { class: 'allergen-item__emoji' }, [a.emoji]),
				el('div', { class: 'allergen-item__main' }, [
					el('div', { class: 'allergen-item__name' }, [a.nome, stato]),
					el('div', { class: 'allergen-item__meta' }, [
						`1ª esposizione: Giorno ${a.prima}${introDate ? ' (' + formatDateShort(introDate) + ')' : ''} · ${a.orario}`,
					]),
					el('div', { class: 'allergen-item__meta' }, [`Mantenimento: ${a.mantenimento}`]),
					introId
						? renderAllergenLog(introId, a.nome)
						: el('div', { class: 'tiny', style: 'margin-top:6px;' }, [
								'Non un allergene: è la fonte principale di ferro.',
						  ]),
				]),
			]);
			card.appendChild(item);
		});
		root.appendChild(card);

		/* Diario completo delle somministrazioni allergene registrate */
		root.appendChild(el('div', { class: 'section-title' }, ['Calendario allergeni (28 giorni)']));
		const tl = el('div', { class: 'card' });
		let any = false;
		D.GIORNI.forEach((g) => {
			g.allergeni.forEach((a) => {
				any = true;
				const id = `${a.nome}-g${g.giorno}`;
				const log = state.allergens[id] || {};
				const date = dateForDay(g.giorno);
				tl.appendChild(
					el('div', { class: 'allergen-item' }, [
						el('div', { class: 'allergen-item__emoji' }, [emojiFor(a.nome)]),
						el('div', { class: 'allergen-item__main' }, [
							el('div', { class: 'allergen-item__name' }, [
								`${a.nome} · Giorno ${g.giorno}`,
								el(
									'span',
									{ class: 'badge ' + (a.tipo === 'mantenimento' ? 'badge--maint' : 'badge--allergen') },
									[tipoLabel(a.tipo)],
								),
							]),
							el('div', { class: 'allergen-item__meta' }, [
								`${cap(a.momento)}${date ? ' · ' + formatDateShort(date) : ''}${
									log.reazione ? ' · ' + (reactionLabel(log.reazione) || '') : ''
								}`,
							]),
						]),
						el(
							'button',
							{
								class: 'icon-btn',
								title: 'Apri il giorno',
								style: 'width:34px;height:34px;font-size:15px;',
								onClick: () => navigate('giorno', { day: g.giorno }),
							},
							['→'],
						),
					]),
				);
			});
		});
		if (!any) tl.appendChild(el('p', { class: 'muted' }, ['Nessun allergene programmato.']));
		root.appendChild(tl);
	}

	function introDayAllergenId(nome, day) {
		const g = D.GIORNI[day - 1];
		if (!g) return null;
		const found = g.allergeni.find((a) => a.nome === nome);
		return found ? `${nome}-g${day}` : null;
	}
	function reactionLabel(r) {
		if (r === 'nessuna') return '✅ Ok';
		if (r === 'lieve') return '⚠️ Lieve';
		if (r === 'grave') return '🚨 Grave';
		return null;
	}
	function tipoLabel(t) {
		if (t === 'nuovo') return 'Nuovo';
		if (t === 'escalation') return 'Aumento';
		return 'Mantenimento';
	}
	function cap(s) {
		return s.charAt(0).toUpperCase() + s.slice(1);
	}
	function emojiFor(nome) {
		const m = D.ALLERGENI_RIEPILOGO.find((a) => a.nome === nome);
		return m ? m.emoji : '•';
	}

	/* ---------------- Render: GUIDA ---------------- */
	function renderGuida() {
		const root = document.getElementById('view-guida');
		if (root.dataset.built === '1') return; // statica: costruisci una sola volta
		root.innerHTML = '';

		root.appendChild(
			el('div', { class: 'callout callout--gold' }, [
				el('h3', {}, ['⭐ Regole d\'oro']),
				el('ul', {}, D.REGOLE_ORO.map((r) => el('li', {}, [r]))),
			]),
		);

		root.appendChild(el('div', { class: 'section-title' }, ['Pappa base']));
		root.appendChild(
			el('div', { class: 'card' }, [
				el('p', { style: 'margin:0;font-size:14px;' }, [
					'Crema di cereali fortificata con ferro + verdure (patata + carota + zucchina passate, ~150 g) + proteine + olio EVO + acqua di cottura q.b.',
				]),
			]),
		);

		root.appendChild(el('div', { class: 'section-title' }, ['Note operative']));
		const notesCard = el('div', { class: 'card' });
		const ul = el('ul', { class: 'rule-list' });
		D.NOTE_OPERATIVE.forEach((n, i) => {
			ul.appendChild(
				el('li', {}, [
					el('span', { class: 'k' }, [String(i + 1) + '.']),
					el('div', { class: 't' }, [el('strong', {}, [n.titolo]), el('span', {}, [n.testo])]),
				]),
			);
		});
		notesCard.appendChild(ul);
		root.appendChild(notesCard);

		root.appendChild(el('div', { class: 'section-title' }, ['Riepilogo allergeni']));
		const allCard = el('div', { class: 'card' });
		D.ALLERGENI_RIEPILOGO.forEach((a) => {
			allCard.appendChild(
				el('div', { class: 'allergen-item' }, [
					el('div', { class: 'allergen-item__emoji' }, [a.emoji]),
					el('div', { class: 'allergen-item__main' }, [
						el('div', { class: 'allergen-item__name' }, [a.nome]),
						el('div', { class: 'allergen-item__meta' }, [
							`1ª: Giorno ${a.prima} · ${a.orario}`,
						]),
						el('div', { class: 'allergen-item__meta' }, [`Mantenimento: ${a.mantenimento}`]),
					]),
				]),
			);
		});
		root.appendChild(allCard);

		root.appendChild(el('div', { class: 'section-title' }, ['Quando fermarsi e sentire il pediatra']));
		root.appendChild(
			el('div', { class: 'callout callout--danger' }, [
				el('h3', {}, ['🚨 Segnali d\'allarme']),
				el('ul', {}, D.SEGNALI_ALLARME.map((s) => el('li', {}, [s.testo]))),
			]),
		);

		root.appendChild(
			el('div', { class: 'disclaimer' }, [
				'Guida pratica basata su ESPGHAN 2017, EFSA 2015/2019, WHO 2023, consensus SIPPS-FIMP 2022, studi LEAP/LEAP-On/PETIT e dati FITS (Abrams 2021). ',
				'Strumento di supporto: va adattato alla crescita e alla storia clinica della bambina in accordo col pediatra curante.',
			]),
		);

		root.dataset.built = '1';
	}

	/* ---------------- Render dispatcher ---------------- */
	function render() {
		if (currentView === 'oggi') renderOggi();
		else if (currentView === 'calendario') renderCalendario();
		else if (currentView === 'giorno') renderGiorno();
		else if (currentView === 'allergeni') renderAllergeni();
		else if (currentView === 'guida') renderGuida();
	}

	/* ---------------- Init ---------------- */
	function init() {
		document.querySelectorAll('.nav__btn').forEach((b) => {
			b.addEventListener('click', () => navigate(b.dataset.view));
		});
		navigate('oggi');

		/* Service worker (funziona solo su http/https, non su file://) */
		if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
			navigator.serviceWorker.register('sw.js').catch(() => {});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
