/* ============================================================
   Svezzamento — logica applicativa (vanilla JS, no dipendenze)
   Persistenza: localStorage. Nessun backend.
   ============================================================ */
(function () {
	'use strict';

	const D = window.SVEZZAMENTO_DATA;
	const STORAGE_KEY = 'svezzamento.v1';
	const TOTAL_DAYS = D.GIORNI.length;
	const OSS_MS = 3 * 60 * 60 * 1000; // finestra osservazione allergene: 3h

	/* ---------------- Stato ---------------- */
	const defaultState = () => ({
		startDate: null, // ISO 'YYYY-MM-DD' del giorno 1
		days: {}, // { [n]: { meals:{}, rules:{}, note:'' } }
		allergens: {}, // { [id]: { somministrato, reazione, reazioneOra, sintomi, ossStart } }
		shopping: {}, // { [settimana]: { [item]: bool } }
		zoom: 1, // dimensione testo
		notif: false, // promemoria browser
		selectedDay: null,
	});

	let state = load();
	let tickInterval = null; // interval per i timer di osservazione

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
	function allergenLog(id) {
		if (!state.allergens[id]) state.allergens[id] = {};
		return state.allergens[id];
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
		return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
	}
	function formatDateShort(date) {
		if (!date) return '';
		return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
	}
	function formatDateTime(iso) {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString('it-IT', {
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit',
			});
		} catch (e) {
			return '';
		}
	}
	function currentDayNumber() {
		const start = parseISO(state.startDate);
		if (!start) return null;
		const diff = Math.round((todayMidnight() - start) / 86400000);
		const n = diff + 1;
		if (n < 1 || n > TOTAL_DAYS) return null;
		return n;
	}
	function cap(s) {
		return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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

	/* ---------------- Notifiche ---------------- */
	function notify(title, body) {
		if (!state.notif) return;
		try {
			if ('Notification' in window && Notification.permission === 'granted') {
				new Notification(title, { body: body, icon: 'icon.svg' });
			}
		} catch (e) {
			/* no-op */
		}
	}

	/* ---------------- Router ---------------- */
	const views = ['oggi', 'calendario', 'settimana', 'allergeni', 'guida', 'giorno', 'impostazioni'];
	let currentView = 'oggi';

	function navigate(view, opts) {
		currentView = view;
		if (opts && opts.day) state.selectedDay = opts.day;
		views.forEach((v) => {
			const node = document.getElementById('view-' + v);
			if (node) node.hidden = v !== view;
		});
		const navMap = { giorno: 'calendario' };
		const activeNav = navMap[view] || view;
		document.querySelectorAll('.nav__btn').forEach((b) => {
			if (b.dataset.view === activeNav) b.setAttribute('aria-current', 'page');
			else b.removeAttribute('aria-current');
		});
		render();
		window.scrollTo({ top: 0, behavior: 'auto' });
	}

	/* ---------------- Timer osservazione (tick) ---------------- */
	function fmtRemaining(ms) {
		if (ms <= 0) return null;
		const h = Math.floor(ms / 3600000);
		const m = Math.floor((ms % 3600000) / 60000);
		const s = Math.floor((ms % 60000) / 1000);
		return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
	}
	function refreshTickers() {
		if (tickInterval) {
			clearInterval(tickInterval);
			tickInterval = null;
		}
		const nodes = () => Array.from(document.querySelectorAll('.js-timer[data-end]'));
		const update = () => {
			const list = nodes();
			if (!list.length) {
				clearInterval(tickInterval);
				tickInterval = null;
				return;
			}
			const now = Date.now();
			list.forEach((node) => {
				const end = Number(node.dataset.end);
				const remaining = end - now;
				const bar = node.querySelector('.js-timer-bar');
				const txt = node.querySelector('.js-timer-text');
				if (remaining <= 0) {
					if (txt) txt.textContent = '✅ Osservazione completata (3h)';
					if (bar) bar.style.width = '100%';
					node.classList.add('done');
					if (node.dataset.notified !== '1') {
						node.dataset.notified = '1';
						notify('Osservazione completata', 'Sono passate le 3 ore di osservazione.');
					}
				} else {
					const pct = Math.min(100, Math.max(0, (1 - remaining / OSS_MS) * 100));
					if (bar) bar.style.width = pct.toFixed(1) + '%';
					if (txt) txt.textContent = 'Mancano ' + fmtRemaining(remaining);
				}
			});
		};
		if (nodes().length) {
			update();
			tickInterval = setInterval(update, 1000);
		}
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
		const dateInput = el('input', { type: 'date', id: 'start-input' });
		dateInput.value = toISO(todayMidnight());
		const agoInput = el('input', {
			type: 'number',
			min: '0',
			max: '27',
			value: '0',
			id: 'ago-input',
			style: 'width:80px;',
		});

		const start = (iso) => {
			state.startDate = iso;
			save();
			navigate('oggi');
		};

		return el('div', { class: 'card' }, [
			el('h2', { style: 'font-size:18px;margin-bottom:8px;' }, ['👋 Iniziamo']),
			el('p', { class: 'muted', style: 'margin-top:0;margin-bottom:16px;' }, [
				'Indica quando è (o è stato) il primo giorno di pappa: il "Giorno 1". L\'app calcolerà da sola a che giorno sei e mostrerà sempre il piano corretto.',
			]),

			el('div', { class: 'setup-opt' }, [
				el('strong', {}, ['① Inizio oggi']),
				el(
					'button',
					{ class: 'btn', onClick: () => start(toISO(todayMidnight())) },
					['Parti da oggi'],
				),
			]),

			el('div', { class: 'setup-opt' }, [
				el('div', {}, [
					el('strong', {}, ['② Ho già iniziato']),
					el('div', { class: 'tiny' }, ['Quanti giorni fa la prima pappa?']),
				]),
				el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
					agoInput,
					el(
						'button',
						{
							class: 'btn',
							onClick: () => {
								const n = Math.max(0, Math.min(27, Number(agoInput.value) || 0));
								const d = todayMidnight();
								d.setDate(d.getDate() - n);
								start(toISO(d));
							},
						},
						['Imposta'],
					),
				]),
			]),

			el('div', { class: 'setup-opt' }, [
				el('div', {}, [
					el('strong', {}, ['③ Scegli una data']),
					el('div', { class: 'tiny' }, ['Data del Giorno 1']),
				]),
				el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
					dateInput,
					el('button', { class: 'btn', onClick: () => start(dateInput.value || toISO(todayMidnight())) }, [
						'Imposta',
					]),
				]),
			]),
		]);
	}

	function renderOutOfRange() {
		const start = parseISO(state.startDate);
		const diff = Math.round((todayMidnight() - start) / 86400000) + 1;
		const notStarted = diff < 1;
		return el('div', { class: 'card' }, [
			el('h2', { style: 'font-size:18px;margin-bottom:8px;' }, [
				notStarted ? '⏳ Non ancora iniziato' : '🎉 Programma completato',
			]),
			el('p', { class: 'muted' }, [
				notStarted
					? `Il Giorno 1 è previsto per ${formatDate(start)}. Nel frattempo puoi consultare calendario, spesa e guida.`
					: `Hai completato i ${TOTAL_DAYS} giorni del 1° mese. Prosegui i mantenimenti (uovo, pesce, arachide, legumi) e programma il controllo Hb/ferritina col pediatra.`,
			]),
			el('div', { class: 'btn-row', style: 'margin-top:12px;' }, [
				el('button', { class: 'btn', onClick: () => navigate('calendario') }, ['Vai al calendario']),
				el('button', { class: 'btn btn--ghost', onClick: () => changeStartDate() }, [
					'Cambia data di inizio',
				]),
			]),
		]);
	}

	function changeStartDate() {
		const cur = state.startDate || toISO(todayMidnight());
		const v = window.prompt('Data di inizio (Giorno 1) in formato AAAA-MM-GG:', cur);
		if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
			state.startDate = v;
			save();
			navigate(currentView === 'giorno' ? 'calendario' : currentView);
		}
	}

	/* Slittamenti del piano: i dati per giorno restano invariati, cambia solo
	   quale "giorno" cade oggi (utile se la bimba salta/rimanda un giorno). */
	function shiftPlan(deltaDays) {
		if (!state.startDate) return;
		const d = parseISO(state.startDate);
		d.setDate(d.getDate() + deltaDays);
		state.startDate = toISO(d);
		save();
		render();
	}
	function setTodayAsDay(x) {
		const n = Math.max(1, Math.min(TOTAL_DAYS, Number(x) || 1));
		const d = todayMidnight();
		d.setDate(d.getDate() - (n - 1));
		state.startDate = toISO(d);
		save();
		render();
	}

	/* Contenuto completo di un giorno (Oggi e dettaglio) */
	function renderDayContent(n, opts) {
		opts = opts || {};
		const g = D.GIORNI[n - 1];
		const ds = dayState(n);
		const date = dateForDay(n);
		const prog = dayProgress(n);
		const frag = document.createDocumentFragment();

		if (opts.hero) {
			frag.appendChild(
				el('div', { class: 'hero' }, [
					el('div', { class: 'hero__eyebrow' }, ['Oggi']),
					el('div', { class: 'hero__day' }, [`Giorno ${n}`]),
					el('div', { class: 'hero__date' }, [cap(formatDate(date))]),
					el('div', { class: 'hero__meta' }, [
						el('span', { class: 'badge' }, [`Settimana ${g.settimana}`]),
						...(g.nuovo ? [el('span', { class: 'badge' }, ['✨ ' + g.nuovo])] : []),
					]),
					el('div', { class: 'hero__progress progress-row' }, [
						el('div', { class: 'bar' }, [el('span', { style: `width:${prog.pct}%` })]),
						el('span', { class: 'label' }, [`${prog.pct}%`]),
					]),
				]),
			);
			frag.appendChild(
				el('button', { class: 'link-btn', onClick: () => navigate('impostazioni') }, [
					'🗓️ Non è il giorno giusto? Sposta il piano',
				]),
			);
		}

		g.allergeni
			.filter((a) => a.osserva)
			.forEach((a) => frag.appendChild(renderAllergenAlert(n, a)));

		if (g.nota) {
			frag.appendChild(
				el('div', { class: 'callout callout--gold' }, [el('div', { html: '💡 ' + g.nota })]),
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
			mealsCard.appendChild(
				checkRow({
					checked,
					onToggle: () => toggleMeal(n, p.id),
					title: [
						el('span', { class: 'emoji' }, [p.emoji]),
						el('span', { class: 'meal-momento' }, [p.label]),
						...allergOfMeal.map((a) =>
							el(
								'span',
								{ class: 'badge ' + (a.tipo === 'mantenimento' ? 'badge--maint' : 'badge--allergen') },
								[(a.tipo === 'mantenimento' ? '↻ ' : '⚠ ') + a.nome],
							),
						),
					],
					desc: testo,
				}),
			);
		});
		frag.appendChild(mealsCard);

		/* Regole fisse */
		frag.appendChild(el('div', { class: 'section-title' }, ['Regole fisse di ogni giorno']));
		const rulesCard = el('div', { class: 'card', style: 'padding:6px;' });
		D.REGOLE_FISSE.forEach((r) => {
			rulesCard.appendChild(
				checkRow({
					checked: !!ds.rules[r.id],
					onToggle: () => toggleRule(n, r.id),
					title: [el('span', { class: 'emoji' }, [r.icona]), r.titolo],
					compact: true,
				}),
			);
		});
		frag.appendChild(rulesCard);
		frag.appendChild(
			el('button', { class: 'link-btn', style: 'margin-top:-4px;', onClick: () => navigate('guida') }, [
				'Cosa significano? Vedi la Guida',
			]),
		);

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

	/* Riga checkbox riutilizzabile */
	function checkRow(o) {
		const row = el(
			'div',
			{
				class: 'check' + (o.compact ? ' check--compact' : ''),
				role: 'checkbox',
				'aria-checked': String(o.checked),
				tabindex: '0',
				'data-checked': String(o.checked),
				onClick: o.onToggle,
				onKeydown: (e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						o.onToggle();
					}
				},
			},
			[
				el('span', { class: 'check__box', html: CHECK_SVG }),
				el('div', { class: 'check__main' }, [
					el('div', { class: 'check__title' }, o.title),
					o.desc ? el('div', { class: 'check__desc' }, [o.desc]) : null,
				]),
			],
		);
		return row;
	}

	/* Avviso allergene con timer di osservazione + log reazione */
	function renderAllergenAlert(n, a) {
		const id = `${a.nome}-g${n}`;
		const log = allergenLog(id);
		const wrap = el('div', { class: 'alert alert--warn' });
		wrap.appendChild(el('div', { class: 'alert__head' }, [`⚠️ Allergene al mattino: ${a.nome}`]));
		wrap.appendChild(
			el('div', { class: 'alert__body' }, [
				a.tipo === 'escalation'
					? 'Aumento della dose. Somministra al mattino e osserva 2-3 ore.'
					: 'Nuovo allergene: somministra al mattino, in giornata tranquilla, e osserva 2-3 ore. Un solo alimento nuovo per volta.',
			]),
		);

		/* Timer osservazione */
		wrap.appendChild(renderObsTimer(id));
		/* Log reazione + eventuale sintomatologia */
		wrap.appendChild(renderAllergenLog(id, a.nome));
		return wrap;
	}

	function renderObsTimer(id) {
		const log = allergenLog(id);
		if (!log.ossStart) {
			return el('div', { class: 'obs-timer' }, [
				el(
					'button',
					{
						class: 'btn btn--sm',
						onClick: () => {
							log.ossStart = Date.now();
							save();
							render();
						},
					},
					['▶ Avvia osservazione (3h)'],
				),
				el('span', { class: 'tiny', style: 'margin-left:8px;' }, ['2h minimo · 3h consigliato']),
			]);
		}
		const end = log.ossStart + OSS_MS;
		const done = Date.now() >= end;
		return el('div', { class: 'obs-timer' }, [
			el('div', { class: 'obs-timer__row' }, [
				el(
					'div',
					{ class: 'js-timer' + (done ? ' done' : ''), 'data-end': String(end) },
					[
						el('div', { class: 'bar' }, [
							el('span', { class: 'js-timer-bar', style: 'width:0%' }),
						]),
						el('div', { class: 'js-timer-text tiny', style: 'margin-top:4px;font-weight:700;' }, [
							done ? '✅ Osservazione completata (3h)' : '…',
						]),
					],
				),
				el(
					'button',
					{
						class: 'btn btn--ghost btn--sm',
						title: 'Azzera timer',
						onClick: () => {
							delete log.ossStart;
							save();
							render();
						},
					},
					['↺'],
				),
			]),
		]);
	}

	/* Widget log reazione (con sintomi + ora + guida se reazione) */
	function renderAllergenLog(id, nome) {
		const log = allergenLog(id);
		const setReaction = (val) => {
			log.somministrato = true;
			log.reazione = val;
			log.reazioneOra = new Date().toISOString();
			save();
			render();
		};
		const opt = (val, cls, label) =>
			el(
				'button',
				{ class: cls, 'aria-pressed': String(log.reazione === val), onClick: () => setReaction(val) },
				[label],
			);

		const children = [
			el('div', { class: 'allergen-item__log' }, [
				el('span', { class: 'tiny', style: 'font-weight:700;' }, ['Reazione:']),
				el('div', { class: 'chip-select' }, [
					opt('nessuna', 'ok', '✅ Nessuna'),
					opt('lieve', 'mild', '⚠️ Lieve'),
					opt('grave', 'bad', '🚨 Grave'),
				]),
				log.reazioneOra
					? el('span', { class: 'tiny' }, ['ore ' + formatDateTime(log.reazioneOra)])
					: null,
			]),
		];

		/* Guida in base alla reazione */
		if (log.reazione === 'grave') {
			children.push(
				el('div', { class: 'callout callout--danger', style: 'margin:10px 0 0;' }, [
					el('h3', {}, ['🚨 Reazione grave — agisci ora']),
					el('div', {}, [
						'Sospendi SUBITO questo alimento e contatta il pediatra / il 112 in caso di gonfiore labbra-volto, vomito ripetuto o difficoltà respiratoria. NON ritardare gli altri allergeni già tollerati.',
					]),
				]),
			);
		} else if (log.reazione === 'lieve') {
			children.push(
				el('div', { class: 'callout callout--gold', style: 'margin:10px 0 0;' }, [
					el('div', {}, [
						'Reazione lieve: osserva l\'evoluzione. Se peggiora o si ripete, sospendi l\'alimento e senti il pediatra prima di riproporlo.',
					]),
				]),
			);
		}

		/* Note sintomi se reazione lieve/grave */
		if (log.reazione === 'lieve' || log.reazione === 'grave') {
			const st = el('textarea', {
				class: 'note-field',
				style: 'margin-top:10px;min-height:48px;',
				placeholder: 'Sintomi osservati (es. rossore attorno alla bocca, ponfi, feci…)',
			});
			st.value = log.sintomi || '';
			st.addEventListener('input', () => {
				log.sintomi = st.value;
				save();
			});
			children.push(st);
		}

		return el('div', {}, children);
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

		let completed = 0;
		for (let i = 1; i <= TOTAL_DAYS; i++) if (dayComplete(i)) completed++;
		const pct = Math.round((completed / TOTAL_DAYS) * 100);
		root.appendChild(
			el('div', { class: 'card' }, [
				el(
					'div',
					{ style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;' },
					[el('strong', {}, ['Avanzamento generale']), el('span', { class: 'muted' }, [`${completed}/${TOTAL_DAYS} giorni`])],
				),
				el('div', { class: 'progress-row' }, [
					el('div', { class: 'bar' }, [el('span', { style: `width:${pct}%` })]),
					el('span', { class: 'label' }, [`${pct}%`]),
				]),
				el('div', { class: 'btn-row', style: 'margin-top:12px;' }, [
					state.startDate
						? el('button', { class: 'btn btn--ghost btn--sm', onClick: () => changeStartDate() }, [
								'Cambia data di inizio',
						  ])
						: el('button', { class: 'btn btn--sm', onClick: () => navigate('oggi') }, ['Imposta data di inizio']),
				]),
			]),
		);

		const todayN = currentDayNumber();

		/* Legenda compatta */
		root.appendChild(
			el('div', { class: 'cal-legend' }, [
				el('span', {}, [el('span', { class: 'k k--today' }), 'oggi']),
				el('span', {}, [el('span', { class: 'k k--done' }), 'fatto']),
				el('span', {}, [el('span', { class: 'k k--allergen' }), 'allergene']),
				el('span', {}, [el('span', { class: 'k k--new' }), 'novità']),
			]),
		);

		const titles = {
			1: 'Avvio, pranzo unico',
			2: 'Uovo, poi pesce',
			3: 'Glutine · legumi',
			4: 'Arachide · 2ª pappa',
		};
		[1, 2, 3, 4].forEach((w) => {
			const grid = el('div', { class: 'cal-grid' });
			D.GIORNI.filter((g) => g.settimana === w).forEach((g) => {
				const n = g.giorno;
				const complete = dayComplete(n);
				const hasAllergen = g.allergeni.some((a) => a.osserva);
				const isNew = !!g.nuovo;
				const label = `Giorno ${n}${g.nuovo ? ' · ' + g.nuovo : ''}`;
				grid.appendChild(
					el(
						'button',
						{
							class: 'cal-cell',
							'data-today': String(n === todayN),
							'data-complete': String(complete),
							title: label,
							'aria-label': label,
							onClick: () => navigate('giorno', { day: n }),
						},
						[
							el('span', { class: 'cal-cell__n' }, [String(n)]),
							hasAllergen
								? el('span', { class: 'cal-cell__dot allergen' })
								: isNew
								? el('span', { class: 'cal-cell__dot new' })
								: null,
							complete ? el('span', { class: 'cal-cell__check' }, ['✓']) : null,
						],
					),
				);
			});
			root.appendChild(
				el('div', { class: 'cal-week' }, [
					el('div', { class: 'cal-week__label' }, [
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
		root.appendChild(
			el('div', { class: 'detail-head' }, [
				el('button', { class: 'icon-btn', title: 'Torna al calendario', onClick: () => navigate('calendario') }, ['←']),
				el('div', { class: 'detail-head__title' }, [
					el('h2', {}, [`Giorno ${n}`]),
					el('div', { class: 'sub' }, [`Settimana ${g.settimana}${date ? ' · ' + formatDate(date) : ''}`]),
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
			]),
		);
		root.appendChild(renderDayContent(n, { hero: false }));
	}

	/* Etichetta breve di un pasto per la vista settimanale (colpo d'occhio) */
	function mealShort(g, pastoId) {
		const raw = g.pasti[pastoId];
		if (!raw) return null;
		const t = raw.toLowerCase();
		if (pastoId === 'mattino') {
			const nuovo = g.allergeni.find(
				(a) => a.momento === 'mattino' && (a.tipo === 'nuovo' || a.tipo === 'escalation'),
			);
			if (nuovo) return { label: nuovo.nome, allergen: true };
			const mant = g.allergeni.find((a) => a.momento === 'mattino');
			if (mant && t.indexOf('latte') !== 0) return { label: mant.nome, allergen: false };
			return { label: 'Latte' };
		}
		if (pastoId === 'pranzo') {
			const parts = ['Pappa'];
			if (t.includes('pesce')) parts.push('pesce');
			else if (t.includes('carne')) parts.push('carne');
			if (t.includes('legumi')) parts.push('legumi');
			return { label: parts.join('+') };
		}
		if (pastoId === 'pomeriggio') {
			if (t.includes('frutta')) return { label: 'Frutta' };
			return { label: 'Latte' };
		}
		if (pastoId === 'sera') {
			if (t.includes('mini-pappa')) return { label: 'Mini-pappa', opt: true };
			return { label: 'Latte' };
		}
		return { label: raw };
	}

	/* ---------------- Render: SETTIMANA (colpo d'occhio) ---------------- */
	function renderSettimana() {
		const root = document.getElementById('view-settimana');
		root.innerHTML = '';
		const todayN = currentDayNumber();
		const currentWeek = todayN ? D.GIORNI[todayN - 1].settimana : 1;
		if (!state.viewWeek) state.viewWeek = currentWeek;
		const w = Math.max(1, Math.min(4, state.viewWeek));
		const titles = {
			1: 'Avvio, pranzo unico',
			2: 'Uovo, poi pesce',
			3: 'Glutine · legumi',
			4: 'Arachide · 2ª pappa',
		};
		const weekDays = D.GIORNI.filter((g) => g.settimana === w);
		const first = weekDays[0].giorno;
		const last = weekDays[weekDays.length - 1].giorno;
		const dFirst = dateForDay(first);
		const dLast = dateForDay(last);

		/* Header con selettore settimana */
		root.appendChild(
			el('div', { class: 'wk-switch' }, [
				el('button', {
					class: 'icon-btn',
					title: 'Settimana precedente',
					disabled: w <= 1 ? 'disabled' : null,
					onClick: () => {
						state.viewWeek = w - 1;
						save();
						render();
					},
				}, ['‹']),
				el('div', { class: 'wk-switch__mid' }, [
					el('div', { class: 'wk-switch__title' }, [
						`Settimana ${w}`,
						w === currentWeek ? el('span', { class: 'badge badge--done', style: 'margin-left:8px;' }, ['in corso']) : null,
					]),
					el('div', { class: 'wk-switch__sub' }, [
						`${titles[w]} · Giorni ${first}-${last}${dFirst ? ' (' + formatDateShort(dFirst) + '–' + formatDateShort(dLast) + ')' : ''}`,
					]),
				]),
				el('button', {
					class: 'icon-btn',
					title: 'Settimana successiva',
					disabled: w >= 4 ? 'disabled' : null,
					onClick: () => {
						state.viewWeek = w + 1;
						save();
						render();
					},
				}, ['›']),
			]),
		);
		if (w !== currentWeek) {
			root.appendChild(
				el('button', { class: 'link-btn', onClick: () => { state.viewWeek = currentWeek; save(); render(); } }, [
					'↩︎ Torna alla settimana in corso',
				]),
			);
		}

		/* 1) Cosa mangia — piano pasti compatto dei 7 giorni */
		root.appendChild(el('div', { class: 'section-title' }, ['Cosa mangia questa settimana']));
		const planCard = el('div', { class: 'card', style: 'padding:6px 14px;' });
		weekDays.forEach((g) => {
			const n = g.giorno;
			const date = dateForDay(n);
			const chips = D.PASTI_ORDINE.map((p) => {
				const s = mealShort(g, p.id);
				if (!s) return null;
				return el(
					'span',
					{ class: 'meal-chip' + (s.allergen ? ' allergen' : '') + (s.opt ? ' opt' : ''), title: p.label },
					[el('span', { class: 'me' }, [p.emoji]), s.label],
				);
			}).filter(Boolean);
			planCard.appendChild(
				el('div', { class: 'day-row', 'data-today': String(n === todayN), onClick: () => navigate('giorno', { day: n }) }, [
					el('div', { class: 'day-row__day' }, [
						el('div', { class: 'n' }, [`G${n}`]),
						date ? el('div', { class: 'd' }, [date.toLocaleDateString('it-IT', { weekday: 'short' })]) : null,
					]),
					el('div', { class: 'day-row__meals' }, chips),
				]),
			);
		});
		root.appendChild(planCard);

		/* 2) Lista della spesa della settimana */
		root.appendChild(el('div', { class: 'section-title' }, ['Lista della spesa della settimana']));
		const wk = D.SPESA_SETTIMANE.find((s) => s.settimana === w);
		if (!state.shopping[w]) state.shopping[w] = {};
		const shopState = state.shopping[w];
		let bought = 0;
		let totalItems = 0;
		wk.categorie.forEach((c) => c.items.forEach((it) => {
			totalItems++;
			if (shopState[it]) bought++;
		}));
		const shopCard = el('div', { class: 'card' });
		shopCard.appendChild(
			el('div', { class: 'progress-row', style: 'margin-bottom:6px;' }, [
				el('div', { class: 'bar' }, [el('span', { style: `width:${totalItems ? Math.round((bought / totalItems) * 100) : 0}%` })]),
				el('span', { class: 'label' }, [`${bought}/${totalItems}`]),
			]),
		);
		wk.categorie.forEach((catg) => {
			shopCard.appendChild(el('div', { class: 'shop-cat' }, [`${catg.emoji} ${catg.nome}`]));
			catg.items.forEach((item) => {
				shopCard.appendChild(
					checkRow({
						checked: !!shopState[item],
						compact: true,
						onToggle: () => {
							shopState[item] = !shopState[item];
							save();
							render();
						},
						title: [item],
					}),
				);
			});
		});
		root.appendChild(shopCard);

		/* 3) Preparazione */
		root.appendChild(el('div', { class: 'section-title' }, ['Preparazione & conservazione']));
		root.appendChild(
			el('div', { class: 'card' }, [
				el('ul', { class: 'bullet' }, D.PREP_TIPS.map((t) => el('li', {}, [t]))),
			]),
		);
	}

	/* ---------------- Render: ALLERGENI ---------------- */
	function renderAllergeni() {
		const root = document.getElementById('view-allergeni');
		root.innerHTML = '';

		root.appendChild(
			el('div', { class: 'callout callout--gold' }, [
				el('h3', {}, ['🕐 Regola della spaziatura']),
				el('div', {}, [
					'Allergeni SEMPRE al mattino, in giorno tranquillo, osservando 2-3 ore. Mai due allergeni nuovi lo stesso giorno; lascia ≥48-72h tra un allergene nuovo e il successivo.',
				]),
			]),
		);

		root.appendChild(el('div', { class: 'section-title' }, ['Allergeni e stato']));
		const card = el('div', { class: 'card' });
		D.ALLERGENI_RIEPILOGO.forEach((a) => {
			const introId = introDayAllergenId(a.nome, a.prima);
			const log = introId ? state.allergens[introId] : null;
			const introdotto = log && log.somministrato;
			const introDate = dateForDay(a.prima);
			const stato = introdotto
				? el('span', { class: 'badge badge--done' }, [reactionLabel(log.reazione) || '✓ Introdotto'])
				: el('span', { class: 'badge badge--week' }, ['Da introdurre']);
			card.appendChild(
				el('div', { class: 'allergen-item' }, [
					el('div', { class: 'allergen-item__emoji' }, [a.emoji]),
					el('div', { class: 'allergen-item__main' }, [
						el('div', { class: 'allergen-item__name' }, [a.nome, stato]),
						el('div', { class: 'allergen-item__meta' }, [
							`1ª esposizione: Giorno ${a.prima}${introDate ? ' (' + formatDateShort(introDate) + ')' : ''} · ${a.orario}`,
						]),
						el('div', { class: 'allergen-item__meta', title: 'Mantenimento: continuare a proporlo per conservare la tolleranza' }, [
							`Mantenimento: ${a.mantenimento}`,
						]),
						introId
							? renderAllergenLog(introId, a.nome)
							: el('div', { class: 'tiny', style: 'margin-top:6px;' }, ['Non un allergene: è la fonte principale di ferro.']),
					]),
				]),
			);
		});
		root.appendChild(card);

		root.appendChild(el('div', { class: 'section-title' }, ['Calendario allergeni (28 giorni)']));
		const tl = el('div', { class: 'card' });
		D.GIORNI.forEach((g) => {
			g.allergeni.forEach((a) => {
				const id = `${a.nome}-g${g.giorno}`;
				const log = state.allergens[id] || {};
				const date = dateForDay(g.giorno);
				tl.appendChild(
					el('div', { class: 'allergen-item' }, [
						el('div', { class: 'allergen-item__emoji' }, [emojiFor(a.nome)]),
						el('div', { class: 'allergen-item__main' }, [
							el('div', { class: 'allergen-item__name' }, [
								`${a.nome} · Giorno ${g.giorno}`,
								el('span', { class: 'badge ' + (a.tipo === 'mantenimento' ? 'badge--maint' : 'badge--allergen') }, [tipoLabel(a.tipo)]),
							]),
							el('div', { class: 'allergen-item__meta' }, [
								`${cap(a.momento)}${date ? ' · ' + formatDateShort(date) : ''}${log.reazione ? ' · ' + (reactionLabel(log.reazione) || '') : ''}`,
							]),
						]),
						el(
							'button',
							{ class: 'icon-btn', title: 'Apri il giorno', style: 'width:34px;height:34px;font-size:15px;', onClick: () => navigate('giorno', { day: g.giorno }) },
							['→'],
						),
					]),
				);
			});
		});
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
	function emojiFor(nome) {
		const m = D.ALLERGENI_RIEPILOGO.find((a) => a.nome === nome);
		return m ? m.emoji : '•';
	}

	/* ---------------- Render: GUIDA ---------------- */
	function renderGuida() {
		const root = document.getElementById('view-guida');
		if (root.dataset.built === '1') return;
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
		const ul = el('ul', { class: 'rule-list' });
		D.NOTE_OPERATIVE.forEach((n, i) => {
			ul.appendChild(
				el('li', {}, [
					el('span', { class: 'k' }, [String(i + 1) + '.']),
					el('div', { class: 't' }, [el('strong', {}, [n.titolo]), el('span', {}, [n.testo])]),
				]),
			);
		});
		root.appendChild(el('div', { class: 'card' }, [ul]));

		root.appendChild(el('div', { class: 'section-title' }, ['Glossario']));
		const gl = el('div', { class: 'card' });
		D.GLOSSARIO.forEach((g) => {
			gl.appendChild(
				el('div', { class: 'gloss' }, [el('strong', {}, [g.termine]), el('span', {}, [g.def])]),
			);
		});
		root.appendChild(gl);

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

	/* ---------------- Render: IMPOSTAZIONI ---------------- */
	/* Card raggruppata con intestazione (icona + titolo), stile "impostazioni". */
	function groupCard(icon, title, bodyChildren, opts) {
		opts = opts || {};
		return el('div', { class: 'group' }, [
			el('div', { class: 'group__header' }, [
				el('span', { class: 'gi', 'aria-hidden': 'true' }, [icon]),
				el('div', {}, [
					el('h3', {}, [title]),
					opts.subtitle ? el('div', { class: 'gsub' }, [opts.subtitle]) : null,
				]),
			]),
			el('div', { class: 'group__body' + (opts.pad ? ' pad' : '') }, bodyChildren),
		]);
	}

	function renderImpostazioni() {
		const root = document.getElementById('view-impostazioni');
		root.innerHTML = '';
		const notifState = 'Notification' in window ? Notification.permission : 'unsupported';

		/* --- Aspetto --- */
		const zoomBtn = (val, label) =>
			el(
				'button',
				{
					'aria-pressed': String((state.zoom || 1) === val),
					onClick: () => {
						state.zoom = val;
						applyZoom();
						save();
						render();
					},
				},
				[label],
			);
		root.appendChild(
			groupCard(
				'🔎',
				'Aspetto',
				[
					el('div', { class: 'gsub', style: 'margin-bottom:8px;' }, ['Dimensione del testo']),
					el('div', { class: 'seg' }, [
						zoomBtn(1, 'Normale'),
						zoomBtn(1.15, 'Grande'),
						zoomBtn(1.3, 'Molto grande'),
					]),
				],
				{ pad: true },
			),
		);

		/* --- Promemoria e diario --- */
		root.appendChild(
			groupCard('🔔', 'Promemoria e diario', [
				el('div', { class: 'setting-row' }, [
					el('div', {}, [
						el('strong', {}, ['Promemoria browser']),
						el('div', { class: 'tiny' }, ['Avviso a fine osservazione allergene (ad app aperta o installata).']),
					]),
					notifState === 'unsupported'
						? el('span', { class: 'tiny' }, ['Non supportato'])
						: el(
								'button',
								{
									class: 'btn btn--sm' + (state.notif && notifState === 'granted' ? '' : ' btn--soft'),
									onClick: async () => {
										try {
											const perm = await Notification.requestPermission();
											state.notif = perm === 'granted';
										} catch (e) {
											state.notif = false;
										}
										save();
										render();
									},
								},
								[state.notif && notifState === 'granted' ? '✅ Attivi' : 'Attiva'],
						  ),
				]),
				el('div', { class: 'setting-row' }, [
					el('div', {}, [
						el('strong', {}, ['Diario per il pediatra']),
						el('div', { class: 'tiny' }, ['Reazioni e note in una pagina stampabile (PDF).']),
					]),
					el('button', { class: 'btn btn--sm btn--soft', onClick: () => exportDiario() }, ['🖨️ Apri']),
				]),
			]),
		);

		/* --- Piano --- */
		const dayNow = currentDayNumber();
		const dayInput = el('input', {
			type: 'number',
			min: '1',
			max: String(TOTAL_DAYS),
			value: String(dayNow || 1),
			'aria-label': 'Numero del giorno di oggi',
			style: 'width:64px;',
		});
		root.appendChild(
			groupCard(
				'🗓️',
				'Piano',
				[
					el('p', { class: 'muted', style: 'margin:0 0 12px;' }, [
						dayNow
							? `Oggi sei al Giorno ${dayNow}. `
							: state.startDate
							? 'Piano fuori intervallo (non iniziato o concluso). '
							: 'Imposta prima la data di inizio. ',
						'Se salti o rimandi un giorno, sposta il piano: i dati registrati restano invariati.',
					]),
					el('div', { class: 'btn-row', style: 'margin-bottom:2px;' }, [
						el(
							'button',
							{
								class: 'btn btn--sm btn--soft',
								title: 'Rimanda: oggi torna al giorno precedente',
								disabled: state.startDate ? null : 'disabled',
								onClick: () => shiftPlan(1),
							},
							['⏮ Posticipa 1 giorno'],
						),
						el(
							'button',
							{
								class: 'btn btn--sm btn--soft',
								title: 'Anticipa: oggi passa al giorno successivo',
								disabled: state.startDate ? null : 'disabled',
								onClick: () => shiftPlan(-1),
							},
							['⏭ Anticipa 1 giorno'],
						),
					]),
					el('div', { class: 'setting-row' }, [
						el('div', {}, [
							el('strong', {}, ['Segna oggi come giorno']),
							el('div', { class: 'tiny' }, ['Riallinea il piano a dove sei davvero.']),
						]),
						el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
							dayInput,
							el('button', { class: 'btn btn--sm', onClick: () => setTodayAsDay(dayInput.value) }, ['Imposta']),
						]),
					]),
					el('div', { class: 'setting-row' }, [
						el('div', {}, [
							el('strong', {}, ['Data di inizio']),
							el('div', { class: 'tiny' }, [
								state.startDate ? cap(formatDate(parseISO(state.startDate))) : 'Non impostata',
							]),
						]),
						el('button', { class: 'btn btn--ghost btn--sm', onClick: () => changeStartDate() }, ['Cambia']),
					]),
				],
				{ pad: true },
			),
		);

		/* --- Dati e backup --- */
		const importInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none;' });
		importInput.addEventListener('change', (e) => importData(e.target.files && e.target.files[0]));
		root.appendChild(
			groupCard(
				'💾',
				'Dati e backup',
				[
					el('p', { class: 'muted', style: 'margin:0 0 12px;' }, [
						'Esporta tutti i dati per salvarli o passarli all\'altro genitore; poi importali sull\'altro telefono.',
					]),
					el('div', { class: 'btn-row', style: 'margin-bottom:2px;' }, [
						el('button', { class: 'btn btn--sm', onClick: () => exportData() }, ['⬇️ Esporta']),
						el('button', { class: 'btn btn--sm btn--soft', onClick: () => importInput.click() }, ['⬆️ Importa']),
						importInput,
					]),
					el('div', { class: 'setting-row' }, [
						el('div', {}, [
							el('strong', {}, ['Azzera tutti i dati']),
							el('div', { class: 'tiny' }, ['Cancella spunte, note e reazioni. Irreversibile.']),
						]),
						el('button', { class: 'btn btn--ghost btn--sm', onClick: () => resetData() }, ['Azzera']),
					]),
				],
				{ pad: true },
			),
		);

		root.appendChild(
			el('div', { class: 'disclaimer' }, [
				'Tutti i dati restano sul tuo dispositivo (nessun account, nessun server).',
			]),
		);
	}

	function applyZoom() {
		try {
			document.documentElement.style.zoom = String(state.zoom || 1);
		} catch (e) {
			/* no-op */
		}
	}

	/* ---------------- Diario / Export / Import ---------------- */
	function exportDiario() {
		const rows = [];
		D.GIORNI.forEach((g) => {
			g.allergeni.forEach((a) => {
				const id = `${a.nome}-g${g.giorno}`;
				const log = state.allergens[id];
				if (log && (log.reazione || log.somministrato)) {
					const date = dateForDay(g.giorno);
					rows.push(
						`<tr><td>G${g.giorno}${date ? ' · ' + formatDateShort(date) : ''}</td><td>${a.nome} (${tipoLabel(a.tipo)})</td><td>${
							reactionLabel(log.reazione) || 'somministrato'
						}</td><td>${log.reazioneOra ? formatDateTime(log.reazioneOra) : ''}</td><td>${escapeHtml(log.sintomi || '')}</td></tr>`,
					);
				}
			});
		});
		const notes = [];
		Object.keys(state.days || {}).forEach((k) => {
			const nd = state.days[k];
			if (nd && nd.note && nd.note.trim()) {
				const date = dateForDay(Number(k));
				notes.push(`<tr><td>G${k}${date ? ' · ' + formatDateShort(date) : ''}</td><td>${escapeHtml(nd.note)}</td></tr>`);
			}
		});

		const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<title>Diario svezzamento</title>
<style>
 body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:800px;margin:24px auto;padding:0 16px;}
 h1{font-size:20px;} h2{font-size:15px;margin-top:24px;border-bottom:2px solid #4a8c6f;padding-bottom:4px;}
 table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;}
 th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;}
 th{background:#f0ede4;} .muted{color:#666;font-size:12px;}
 @media print{button{display:none;}}
</style></head><body>
 <h1>🍼 Diario svezzamento</h1>
 <p class="muted">Inizio: ${state.startDate ? cap(formatDate(parseISO(state.startDate))) : '—'} · Generato per la visita pediatrica.</p>
 <button onclick="window.print()" style="padding:8px 14px;border:none;background:#4a8c6f;color:#fff;border-radius:6px;font-weight:700;cursor:pointer;">🖨️ Stampa / Salva PDF</button>
 <h2>Allergeni e reazioni</h2>
 ${rows.length ? `<table><thead><tr><th>Giorno</th><th>Allergene</th><th>Esito</th><th>Ora</th><th>Sintomi</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="muted">Nessuna somministrazione registrata.</p>'}
 <h2>Note giornaliere</h2>
 ${notes.length ? `<table><thead><tr><th>Giorno</th><th>Nota</th></tr></thead><tbody>${notes.join('')}</tbody></table>` : '<p class="muted">Nessuna nota.</p>'}
 <p class="muted" style="margin-top:24px;">Strumento di supporto, non sostituisce il parere del pediatra.</p>
</body></html>`;

		const win = window.open('', '_blank');
		if (win) {
			win.document.open();
			win.document.write(html);
			win.document.close();
		} else {
			// popup bloccato: fallback download
			downloadBlob(html, 'diario-svezzamento.html', 'text/html');
		}
	}

	function escapeHtml(s) {
		return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
	}

	function downloadBlob(content, filename, type) {
		try {
			const blob = new Blob([content], { type: type || 'application/octet-stream' });
			const url = URL.createObjectURL(blob);
			const a = el('a', { href: url, download: filename });
			document.body.appendChild(a);
			a.click();
			setTimeout(() => {
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}, 0);
		} catch (e) {
			window.alert('Impossibile esportare su questo browser.');
		}
	}

	function exportData() {
		const payload = JSON.stringify(state, null, 2);
		const stamp = toISO(todayMidnight());
		downloadBlob(payload, `svezzamento-backup-${stamp}.json`, 'application/json');
	}

	function importData(file) {
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const data = JSON.parse(String(reader.result));
				if (typeof data !== 'object' || data === null) throw new Error('formato');
				state = Object.assign(defaultState(), data);
				save();
				applyZoom();
				window.alert('Dati importati correttamente.');
				navigate('oggi');
			} catch (e) {
				window.alert('File non valido: impossibile importare.');
			}
		};
		reader.readAsText(file);
	}

	function resetData() {
		if (!window.confirm('Azzerare TUTTI i dati (spunte, note, reazioni, data di inizio)? Operazione irreversibile.')) return;
		state = defaultState();
		save();
		applyZoom();
		navigate('oggi');
	}

	/* ---------------- Render dispatcher ---------------- */
	function render() {
		if (currentView === 'oggi') renderOggi();
		else if (currentView === 'calendario') renderCalendario();
		else if (currentView === 'giorno') renderGiorno();
		else if (currentView === 'settimana') renderSettimana();
		else if (currentView === 'allergeni') renderAllergeni();
		else if (currentView === 'guida') renderGuida();
		else if (currentView === 'impostazioni') renderImpostazioni();
		refreshTickers();
	}

	/* ---------------- Init ---------------- */
	function init() {
		applyZoom();
		document.querySelectorAll('.nav__btn').forEach((b) => {
			b.addEventListener('click', () => navigate(b.dataset.view));
		});
		const gear = document.getElementById('settings-btn');
		if (gear) gear.addEventListener('click', () => navigate('impostazioni'));
		navigate('oggi');

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
