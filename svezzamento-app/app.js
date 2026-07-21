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
		startDate: null,
		days: {}, // { [n]: { meals:{}, rules:{}, note:'' } }
		allergens: {}, // { [id]: { somministrato, reazione, reazioneOra, sintomi, ossStart, notified } }
		shopping: {}, // { [settimana]: { [item]: bool } }
		zoom: 1,
		notif: false,
		pediatra: '', // numero pediatra per la scheda emergenza
		introDismissed: false,
		yesterdayDismissed: null, // giorno di cui è stato ignorato il promemoria "ieri incompleto"
		selectedDay: null,
		viewWeek: null,
	});

	let state = load();
	let tickInterval = null;

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
		} catch (e) {}
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
	function formatDateMid(date) {
		if (!date) return '';
		return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
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
	function rawDayNumber() {
		const start = parseISO(state.startDate);
		if (!start) return null;
		return Math.round((todayMidnight() - start) / 86400000) + 1;
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

	/* ---------------- Meal timing / next meal ---------------- */
	function mealWindowEnd(id) {
		return id === 'mattino' ? 10 : id === 'pranzo' ? 14 : id === 'pomeriggio' ? 18 : 24;
	}
	function mealTimeLabel(id) {
		return id === 'mattino' ? '~8:00' : id === 'pranzo' ? '~12:00' : id === 'pomeriggio' ? '~16:00' : '~19:00';
	}
	function nextMealId(n) {
		const g = D.GIORNI[n - 1];
		const ds = dayState(n);
		const order = D.PASTI_ORDINE.filter((p) => g.pasti[p.id]);
		const hour = new Date().getHours();
		let cand = order.find((p) => !ds.meals[p.id] && mealWindowEnd(p.id) > hour);
		if (!cand) cand = order.find((p) => !ds.meals[p.id]);
		return cand ? cand.id : null;
	}

	/* ---------------- Allergen helpers ---------------- */
	function realAllergenIntro(g) {
		return g.allergeni.find(
			(a) => D.REAL_ALLERGENS.indexOf(a.nome) >= 0 && (a.tipo === 'nuovo' || a.tipo === 'escalation'),
		);
	}
	function prevExposure(nome, day) {
		for (let d = day - 1; d >= 1; d--) {
			const g = D.GIORNI[d - 1];
			const a = g.allergeni.find((x) => x.nome === nome && (x.tipo === 'nuovo' || x.tipo === 'escalation'));
			if (a) return { day: d, log: state.allergens[`${nome}-g${d}`] || {} };
		}
		return null;
	}
	function activeObservation() {
		let found = null;
		Object.keys(state.allergens).forEach((id) => {
			const l = state.allergens[id];
			if (l && l.ossStart && Date.now() < l.ossStart + OSS_MS) {
				const m = id.match(/-g(\d+)$/);
				found = { id, end: l.ossStart + OSS_MS, day: m ? Number(m[1]) : null, nome: id.split('-g')[0] };
			}
		});
		return found;
	}
	function graveToday() {
		const n = currentDayNumber();
		if (n == null) return false;
		const g = D.GIORNI[n - 1];
		return g.allergeni.some((a) => {
			const l = state.allergens[`${a.nome}-g${n}`];
			return l && l.reazione === 'grave';
		});
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

	/* ---------------- Notifiche ---------------- */
	function notify(title, body) {
		if (!state.notif) return;
		try {
			if ('Notification' in window && Notification.permission === 'granted') {
				new Notification(title, { body: body, icon: 'icon.svg' });
			}
		} catch (e) {}
	}
	function notifyObsDone(id) {
		const l = state.allergens[id];
		if (!l || l.notified) return;
		l.notified = true;
		save();
		notify('Osservazione finita', 'Sono passate le 3 ore. Segna com\'è andata.');
	}

	/* ---------------- Bottom sheet (modale) ---------------- */
	function closeSheet() {
		const o = document.querySelector('.sheet-overlay');
		if (o) o.remove();
		document.removeEventListener('keydown', escClose);
	}
	function escClose(e) {
		if (e.key === 'Escape') closeSheet();
	}
	function openSheet(title, contentNodes) {
		closeSheet();
		const sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
			el('div', { class: 'sheet__head' }, [
				el('h3', {}, [title]),
				el('button', { class: 'icon-btn', 'aria-label': 'Chiudi', onClick: closeSheet }, ['✕']),
			]),
			el('div', { class: 'sheet__body' }, contentNodes),
		]);
		const overlay = el('div', { class: 'sheet-overlay', onClick: (e) => { if (e.target === overlay) closeSheet(); } }, [sheet]);
		document.body.appendChild(overlay);
		document.addEventListener('keydown', escClose);
	}

	function openEmergency() {
		const E = D.EMERGENZA;
		const pediatraCta = state.pediatra
			? el('a', { class: 'btn btn--block', href: 'tel:' + state.pediatra.replace(/\s/g, '') }, ['📞 Chiama il pediatra'])
			: el('button', { class: 'btn btn--block btn--soft', onClick: () => { closeSheet(); navigate('impostazioni'); } }, ['+ Aggiungi il numero del pediatra']);
		openSheet('🚨 Emergenza', [
			el('div', { class: 'callout callout--danger', style: 'margin-top:0;' }, [
				el('h3', {}, ['Chiama subito il 112 se:']),
				el('ul', {}, E.urgente.map((x) => el('li', {}, [x]))),
				el('a', { class: 'btn btn--block btn--danger-solid', href: 'tel:112' }, ['📞 Chiama il 112']),
			]),
			el('div', { class: 'callout callout--gold' }, [
				el('h3', {}, ['Chiama il pediatra oggi stesso se:']),
				el('ul', {}, E.pediatra.map((x) => el('li', {}, [x]))),
				pediatraCta,
			]),
			el('p', { class: 'muted', style: 'margin-bottom:0;' }, [E.regola]),
		]);
	}

	function openPappa() {
		const P = D.PAPPA_BASE;
		openSheet(P.titolo, [
			el('ul', { class: 'bullet', style: 'margin-top:0;' }, P.ingredienti.map((i) => el('li', {}, [i]))),
			el('p', { class: 'tiny', style: 'margin-bottom:0;' }, [P.nota]),
		]);
	}

	function openShiftSheet() {
		const dayNow = currentDayNumber();
		const dayInput = el('input', { type: 'number', min: '1', max: String(TOTAL_DAYS), value: String(dayNow || 1), 'aria-label': 'Giorno di oggi', style: 'width:72px;' });
		openSheet('Sposta il piano', [
			el('p', { class: 'muted', style: 'margin-top:0;' }, [
				dayNow ? `Oggi risulta il Giorno ${dayNow}. ` : '',
				'Se hai saltato o rimandato un giorno, riallinea il piano. I dati registrati restano invariati.',
			]),
			el('div', { class: 'shift-opt' }, [
				el('div', {}, [el('strong', {}, ['Abbiamo saltato un giorno']), el('div', { class: 'tiny' }, [dayNow ? `oggi torna Giorno ${dayNow - 1}` : 'oggi indietro di 1'])]),
				el('button', { class: 'btn btn--sm btn--soft', disabled: state.startDate && dayNow > 1 ? null : 'disabled', onClick: () => { shiftPlan(1); closeSheet(); } }, ['↩ Indietro']),
			]),
			el('div', { class: 'shift-opt' }, [
				el('div', {}, [el('strong', {}, ['Ci portiamo avanti']), el('div', { class: 'tiny' }, [dayNow ? `oggi diventa Giorno ${dayNow + 1}` : 'oggi avanti di 1'])]),
				el('button', { class: 'btn btn--sm btn--soft', disabled: state.startDate ? null : 'disabled', onClick: () => { shiftPlan(-1); closeSheet(); } }, ['↪ Avanti']),
			]),
			el('div', { class: 'shift-opt' }, [
				el('div', {}, [el('strong', {}, ['Segna oggi come giorno']), el('div', { class: 'tiny' }, ['riallinea a dove sei davvero'])]),
				el('div', { style: 'display:flex;gap:8px;align-items:center;' }, [
					dayInput,
					el('button', { class: 'btn btn--sm', onClick: () => { setTodayAsDay(dayInput.value); closeSheet(); } }, ['Imposta']),
				]),
			]),
		]);
	}

	/* ---------------- Router ---------------- */
	const views = ['oggi', 'calendario', 'settimana', 'allergeni', 'guida', 'giorno', 'impostazioni'];
	let currentView = 'oggi';

	function navigate(view, opts) {
		closeSheet();
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

	/* ---------------- Timer tick ---------------- */
	function fmtRemaining(ms, short) {
		if (ms <= 0) return null;
		const h = Math.floor(ms / 3600000);
		const m = Math.floor((ms % 3600000) / 60000);
		const s = Math.floor((ms % 60000) / 1000);
		if (short) return `${h}h ${String(m).padStart(2, '0')}m`;
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
				const isChip = node.classList.contains('timer-chip');
				const bar = node.querySelector('.js-timer-bar');
				const txt = node.querySelector('.js-timer-text');
				if (remaining <= 0) {
					if (txt) txt.textContent = isChip ? 'fatto' : '✅ Osservazione completata (3h)';
					if (bar) bar.style.width = '100%';
					node.classList.add('done');
					if (node.dataset.id) notifyObsDone(node.dataset.id);
				} else {
					const pct = Math.min(100, Math.max(0, (1 - remaining / OSS_MS) * 100));
					if (bar) bar.style.width = pct.toFixed(1) + '%';
					if (txt) txt.textContent = isChip ? fmtRemaining(remaining, true) : 'Mancano ' + fmtRemaining(remaining);
				}
			});
		};
		if (nodes().length) {
			update();
			tickInterval = setInterval(update, 1000);
		}
	}

	/* ---------------- Header extras: banner grave + timer chip ---------------- */
	function renderGlobalBanner() {
		const c = document.getElementById('global-banner');
		if (!c) return;
		c.innerHTML = '';
		if (graveToday()) {
			c.appendChild(
				el('div', { class: 'grave-banner' }, [
					el('div', { class: 'grave-banner__txt' }, [
						el('strong', {}, ['🚨 Reazione grave registrata oggi']),
						el('div', { class: 'tiny' }, ['Sospendi l\'alimento. Sintomi urgenti → 112.']),
					]),
					el('button', { class: 'btn btn--sm btn--danger-solid', onClick: openEmergency }, ['Cosa fare']),
				]),
			);
		}
	}
	function renderTimerChip() {
		const c = document.getElementById('timer-chip');
		if (!c) return;
		c.innerHTML = '';
		const a = activeObservation();
		if (!a) {
			c.hidden = true;
			return;
		}
		c.hidden = false;
		c.appendChild(
			el('button', {
				class: 'timer-chip js-timer',
				'data-end': String(a.end),
				'data-id': a.id,
				title: 'Osservazione in corso: ' + a.nome,
				onClick: () => (a.day && currentDayNumber() !== a.day ? navigate('giorno', { day: a.day }) : navigate('oggi')),
			}, ['⏱ ', a.nome, ' · ', el('span', { class: 'js-timer-text' }, ['…'])]),
		);
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
		/* Mini-mappa una-tantum */
		if (!state.introDismissed) root.appendChild(renderIntroCard());
		/* Promemoria "ieri incompleto" */
		const yb = renderYesterdayReminder(n);
		if (yb) root.appendChild(yb);
		root.appendChild(renderDayContent(n, { hero: true }));
	}

	function renderIntroCard() {
		return el('div', { class: 'card intro-card' }, [
			el('div', { class: 'intro-card__head' }, [
				el('strong', {}, ['Come funziona']),
				el('button', { class: 'icon-btn', 'aria-label': 'Chiudi', onClick: () => { state.introDismissed = true; save(); render(); } }, ['✕']),
			]),
			el('div', { class: 'intro-map' }, D.DOVE_TROVO.map((x) =>
				el('div', { class: 'intro-map__row' }, [el('span', { class: 'im-ico' }, [x.icona]), el('span', {}, [el('strong', {}, [x.nome + ' ']), el('span', { class: 'tiny' }, ['· ' + x.desc])])]),
			)),
		]);
	}

	function renderYesterdayReminder(n) {
		if (n <= 1 || state.yesterdayDismissed === n) return null;
		const y = n - 1;
		const g = D.GIORNI[y - 1];
		const ds = dayState(y);
		const keys = mealKeys(g);
		const used = keys.some((k) => ds.meals[k]) || Object.keys(ds.rules || {}).some((k) => ds.rules[k]);
		const missing = keys.filter((k) => !ds.meals[k]).length;
		if (!used || missing === 0) return null;
		return el('div', { class: 'nudge' }, [
			el('div', { class: 'nudge__txt' }, [`Ieri (Giorno ${y}): ${missing} ${missing === 1 ? 'pasto non segnato' : 'pasti non segnati'}`]),
			el('div', { style: 'display:flex;gap:6px;' }, [
				el('button', { class: 'btn btn--sm btn--soft', onClick: () => navigate('giorno', { day: y }) }, ['Completa']),
				el('button', { class: 'icon-btn', 'aria-label': 'Ignora', onClick: () => { state.yesterdayDismissed = n; save(); render(); } }, ['✕']),
			]),
		]);
	}

	function renderSetup() {
		const dateInput = el('input', { type: 'date', id: 'start-input' });
		dateInput.value = toISO(todayMidnight());
		const start = (iso) => {
			state.startDate = iso;
			save();
			navigate('oggi');
		};
		const advanced = el('div', { class: 'setup-adv', hidden: 'hidden' }, [
			el('div', { class: 'field', style: 'margin-top:12px;' }, [
				el('label', { for: 'start-input' }, ['Data del primo giorno di pappa (Giorno 1)']),
				dateInput,
			]),
			el('button', { class: 'btn btn--block', onClick: () => start(dateInput.value || toISO(todayMidnight())) }, ['Imposta questa data']),
		]);
		return el('div', { class: 'card' }, [
			el('h2', { style: 'font-size:19px;margin-bottom:6px;' }, ['🍼 Il tuo svezzamento, giorno per giorno']),
			el('p', { class: 'muted', style: 'margin-top:0;' }, [
				'Ogni giorno ti dico cosa dare, quando introdurre gli allergeni e cosa comprare. Vedrai subito il piano del Giorno 1.',
			]),
			el('button', { class: 'btn btn--block', style: 'margin-top:8px;font-size:16px;padding:14px;', onClick: () => start(toISO(todayMidnight())) }, ['Inizia oggi']),
			el('button', {
				class: 'link-btn',
				onClick: (e) => {
					const box = e.target.closest('.card').querySelector('.setup-adv');
					if (box) box.hidden = !box.hidden;
				},
			}, ['Ho già iniziato → scegli la data del Giorno 1']),
			advanced,
		]);
	}

	function renderOutOfRange() {
		const start = parseISO(state.startDate);
		const diff = rawDayNumber();
		const notStarted = diff < 1;
		if (notStarted) {
			const giorni = 1 - diff;
			return el('div', {}, [
				el('div', { class: 'card' }, [
					el('h2', { style: 'font-size:18px;margin-bottom:6px;' }, ['⏳ Si parte tra ' + giorni + (giorni === 1 ? ' giorno' : ' giorni')]),
					el('p', { class: 'muted', style: 'margin-top:0;' }, ['Il Giorno 1 è ' + formatDate(start) + '. Intanto puoi preparati:']),
					el('div', { class: 'prep-links' }, [
						el('button', { class: 'btn btn--soft btn--block', onClick: () => { state.viewWeek = 1; save(); navigate('settimana'); } }, ['🛒 Vedi la spesa della Settimana 1']),
						el('button', { class: 'btn btn--soft btn--block', onClick: () => navigate('guida') }, ['📖 Leggi le regole d\'oro']),
						el('button', { class: 'btn btn--soft btn--block', onClick: openPappa }, ['🍲 Ricetta della pappa base']),
					]),
					el('button', { class: 'link-btn', onClick: changeStartDate }, ['La data non è giusta? Cambiala']),
				]),
			]);
		}
		/* Programma completato → riepilogo utile */
		let done = 0;
		for (let i = 1; i <= TOTAL_DAYS; i++) if (dayComplete(i)) done++;
		const reazioni = [];
		D.GIORNI.forEach((g) => g.allergeni.forEach((a) => {
			const l = state.allergens[`${a.nome}-g${g.giorno}`];
			if (l && l.reazione) reazioni.push({ nome: a.nome, giorno: g.giorno, r: l.reazione });
		}));
		return el('div', {}, [
			el('div', { class: 'card' }, [
				el('h2', { style: 'font-size:18px;margin-bottom:6px;' }, ['🎉 1° mese completato!']),
				el('p', { class: 'muted', style: 'margin-top:0;' }, [`Hai seguito ${done}/${TOTAL_DAYS} giorni. Ora si prosegue con i mantenimenti.`]),
			]),
			el('div', { class: 'section-title' }, ['Mantenimenti da tenere']),
			el('div', { class: 'card', style: 'padding:6px;' }, D.ALLERGENI_RIEPILOGO.filter((a) => a.allergeneVero).map((a) =>
				el('div', { class: 'maint-row' }, [
					el('span', { class: 'maint-row__emoji' }, [a.emoji]),
					el('div', { class: 'maint-row__main' }, [el('strong', {}, [a.nome]), el('div', { class: 'tiny' }, [a.quando])]),
					el('span', { class: 'badge badge--maint' }, [a.freqBreve]),
				]),
			)),
			el('div', { class: 'callout callout--gold' }, [
				el('div', {}, ['🩸 Prenota l\'esame del sangue per il ferro (emoglobina e ferritina) col pediatra.']),
			]),
			el('div', { class: 'btn-row', style: 'margin-top:4px;' }, [
				el('button', { class: 'btn btn--block', onClick: () => navigate('allergeni') }, ['Vedi mantenimenti e reazioni']),
				el('button', { class: 'btn btn--soft btn--block', onClick: exportDiario }, ['🖨️ Diario per il pediatra']),
			]),
			el('button', { class: 'link-btn', onClick: changeStartDate }, ['Cambia data di inizio']),
		]);
	}

	function changeStartDate() {
		const input = el('input', { type: 'date', value: state.startDate || toISO(todayMidnight()) });
		openSheet('Data di inizio (Giorno 1)', [
			el('p', { class: 'muted', style: 'margin-top:0;' }, ['Scegli il giorno in cui hai dato (o darai) la prima pappa.']),
			el('div', { class: 'field' }, [input]),
			el('button', { class: 'btn btn--block', onClick: () => {
				if (!input.value) { window.alert('Scegli una data.'); return; }
				state.startDate = input.value;
				save();
				closeSheet();
				navigate(currentView === 'giorno' ? 'oggi' : currentView);
			} }, ['Salva']),
		]);
	}

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

	/* ---------------- Slim hero ---------------- */
	function renderSlimHero(n, prog) {
		const g = D.GIORNI[n - 1];
		const date = dateForDay(n);
		return el('div', { class: 'hero-slim' }, [
			el('div', { class: 'hero-slim__row' }, [
				el('div', { class: 'hero-slim__day' }, [`Giorno ${n}`, el('span', { class: 'hero-slim__of' }, [` di ${TOTAL_DAYS}`])]),
				el('div', { class: 'hero-slim__date' }, [cap(formatDateMid(date)) + ' · Sett. ' + g.settimana]),
			]),
			el('div', { class: 'hero-slim__bar bar' }, [el('span', { style: `width:${prog.pct}%` })]),
		]);
	}

	/* ---------------- Day content ---------------- */
	function renderDayContent(n, opts) {
		opts = opts || {};
		const g = D.GIORNI[n - 1];
		const ds = dayState(n);
		const prog = dayProgress(n);
		const isToday = !!opts.hero && currentDayNumber() === n;
		const frag = document.createDocumentFragment();

		if (opts.hero) frag.appendChild(renderSlimHero(n, prog));

		/* Allergeni da osservare: card guidata (di solito 1) */
		g.allergeni.filter((a) => a.osserva).forEach((a) => frag.appendChild(renderAllergenGuided(n, a)));

		/* Nota del giorno (informativa, non duplica più l'allergene) */
		if (g.nota) frag.appendChild(el('div', { class: 'callout callout--info' }, [el('div', { html: '💡 ' + g.nota })]));

		/* Pasti */
		frag.appendChild(el('div', { class: 'section-title' }, [isToday ? 'I pasti di oggi' : 'I pasti del giorno']));
		const nextId = isToday ? nextMealId(n) : null;
		const mealsCard = el('div', { class: 'card', style: 'padding:4px;' });
		D.PASTI_ORDINE.forEach((p) => {
			if (!g.pasti[p.id]) return;
			mealsCard.appendChild(renderMealRow(n, p, { nextId }));
		});
		frag.appendChild(mealsCard);

		/* Regole valide tutto il giorno (solo vitD + poppate) */
		frag.appendChild(el('div', { class: 'section-title' }, ['Ogni giorno']));
		const rulesCard = el('div', { class: 'card', style: 'padding:6px;' });
		D.REGOLE_FISSE.filter((r) => r.pasto === null).forEach((r) => {
			rulesCard.appendChild(
				checkRow({ checked: !!ds.rules[r.id], onToggle: () => toggleRule(n, r.id), title: [el('span', { class: 'emoji' }, [r.icona]), r.titolo], compact: true }),
			);
		});
		frag.appendChild(rulesCard);

		/* Domani (solo oggi) */
		if (isToday) {
			const t = renderDomani(n);
			if (t) frag.appendChild(t);
		}

		/* Note personali */
		frag.appendChild(el('div', { class: 'section-title' }, ['Le mie note']));
		const ta = el('textarea', { class: 'note-field', placeholder: 'Come è andata? Quanto ha mangiato, gradimento…' });
		ta.value = ds.note || '';
		ta.addEventListener('input', () => { ds.note = ta.value; save(); });
		frag.appendChild(el('div', { class: 'card' }, [ta]));

		/* Sposta piano (discreto, in fondo) */
		if (isToday) {
			frag.appendChild(el('button', { class: 'link-btn', onClick: openShiftSheet }, ['🗓️ Il giorno non torna? Sposta il piano']));
		}
		return frag;
	}

	/* Riga pasto: cibo primario, momento come sopratitolo, prossimo evidenziato */
	function renderMealRow(n, p, opts) {
		const g = D.GIORNI[n - 1];
		const ds = dayState(n);
		const testo = g.pasti[p.id];
		const checked = !!ds.meals[p.id];
		const isNext = opts.nextId === p.id && !checked;
		const allergOfMeal = g.allergeni.filter((a) => a.momento === p.id);

		const supParts = [];
		if (isNext) supParts.push(el('span', { class: 'meal__next' }, ['PROSSIMO']));
		supParts.push(p.label.replace(' (~12:00)', '').toUpperCase() + ' · ' + mealTimeLabel(p.id));

		const main = el('div', { class: 'meal__main' }, [
			el('div', { class: 'meal__sup' }, supParts),
			el('div', { class: 'meal__food' }, [testo]),
		]);
		if (allergOfMeal.length) {
			main.appendChild(el('div', { class: 'meal__badges' }, allergOfMeal.map((a) =>
				el('span', { class: 'badge ' + (a.tipo === 'mantenimento' ? 'badge--maint' : 'badge--allergen') }, [(a.tipo === 'mantenimento' ? '↻ ' : '⚠ ') + a.nome]),
			)));
		}
		if (p.id === 'pranzo') {
			if (/pappa/i.test(testo)) main.appendChild(el('button', { class: 'pappa-chip', onClick: openPappa }, ['🍲 Ricetta pappa base']));
			main.appendChild(renderFoldedRules(n));
		}

		const box = el('button', {
			class: 'meal__check',
			role: 'checkbox',
			'aria-checked': String(checked),
			'aria-label': 'Segna ' + p.label,
			onClick: () => toggleMeal(n, p.id),
			onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMeal(n, p.id); } },
			tabindex: '0',
		}, [el('span', { class: 'check__box', html: CHECK_SVG })]);

		return el('div', { class: 'meal' + (checked ? ' meal--done' : '') + (isNext ? ' meal--next' : ''), 'data-checked': String(checked) }, [box, main]);
	}

	function renderFoldedRules(n) {
		const ds = dayState(n);
		const wrap = el('div', { class: 'rule-chips' });
		D.REGOLE_FISSE.filter((r) => r.pasto === 'pranzo').forEach((r) => {
			const on = !!ds.rules[r.id];
			wrap.appendChild(
				el('button', { class: 'rule-chip' + (on ? ' on' : ''), 'aria-pressed': String(on), title: r.dettaglio, onClick: () => toggleRule(n, r.id) }, [on ? '✓ ' + r.breve : r.icona + ' ' + r.breve]),
			);
		});
		return wrap;
	}

	function renderDomani(n) {
		if (n >= TOTAL_DAYS) return null;
		const t = D.GIORNI[n];
		const chips = D.PASTI_ORDINE.map((p) => {
			const s = mealShort(t, p.id);
			return s ? el('span', { class: 'meal-chip' + (s.allergen ? ' allergen' : '') }, [s.label]) : null;
		}).filter(Boolean);
		const allerg = t.allergeni.find((a) => a.osserva);
		let prep = null;
		if (allerg) prep = `Prepara ${allerg.nome.toLowerCase()} e scegli una giornata tranquilla: domani si prova al mattino.`;
		else if (t.pasti.pomeriggio && /frutta/i.test(t.pasti.pomeriggio)) prep = 'Stasera scongela una porzione di verdure per la pappa di domani.';
		return el('div', { class: 'card domani' }, [
			el('div', { class: 'domani__head' }, ['Domani · Giorno ' + (n + 1), allerg ? el('span', { class: 'badge badge--allergen', style: 'margin-left:8px;' }, ['⚠ ' + allerg.nome]) : null]),
			el('div', { class: 'domani__meals' }, chips),
			prep ? el('div', { class: 'domani__prep tiny' }, ['🧊 ' + prep]) : null,
		]);
	}

	/* Riga checkbox riutilizzabile */
	function checkRow(o) {
		return el('div', {
			class: 'check' + (o.compact ? ' check--compact' : ''),
			role: 'checkbox',
			'aria-checked': String(o.checked),
			tabindex: '0',
			'data-checked': String(o.checked),
			onClick: o.onToggle,
			onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onToggle(); } },
		}, [
			el('span', { class: 'check__box', html: CHECK_SVG }),
			el('div', { class: 'check__main' }, [el('div', { class: 'check__title' }, o.title), o.desc ? el('div', { class: 'check__desc' }, [o.desc]) : null]),
		]);
	}

	/* ---------------- Allergene: card guidata ---------------- */
	function shortAllergenDose(t) {
		if (!t) return 'l\'alimento';
		return t.split(/\.\s|,?\s*Osserva/i)[0].trim().replace(/[,.]$/, '');
	}
	function renderAllergenGuided(n, a) {
		const id = `${a.nome}-g${n}`;
		const g = D.GIORNI[n - 1];
		const wrap = el('div', { class: 'allergen-card' });
		wrap.appendChild(el('div', { class: 'allergen-card__head' }, ['⚠️ ', el('strong', {}, [a.tipo === 'escalation' ? `${a.nome}: 2ª dose ↑` : `${a.nome} — 1ª volta`])]));

		if (a.tipo === 'escalation') {
			const prev = prevExposure(a.nome, n);
			if (prev) {
				const r = prev.log.reazione;
				let msg, cls;
				if (r === 'nessuna') { msg = `✅ Il Giorno ${prev.day} è andato bene: oggi puoi aumentare un po' la dose.`; cls = 'ok'; }
				else if (r === 'lieve') { msg = `⚠️ Il Giorno ${prev.day} c'è stata una reazione lieve: senti il pediatra prima di aumentare.`; cls = 'warn'; }
				else if (r === 'grave') { msg = `🚨 Il Giorno ${prev.day} reazione grave: NON procedere senza il pediatra.`; cls = 'bad'; }
				else { msg = `❓ Esito del Giorno ${prev.day} non registrato: controlla prima di aumentare.`; cls = 'warn'; }
				wrap.appendChild(el('div', { class: 'allergen-card__prev ' + cls }, [msg]));
			}
		}

		wrap.appendChild(el('ol', { class: 'steps' }, [
			el('li', {}, [`Dai ${shortAllergenDose(g.pasti.mattino)} al mattino, in giornata tranquilla.`]),
			el('li', {}, ['Avvia l\'osservazione e tieni d\'occhio la bimba per 2-3 ore.']),
			el('li', {}, ['A fine osservazione, segna com\'è andata.']),
		]));
		wrap.appendChild(renderObsTimer(id, a.nome));
		wrap.appendChild(renderReaction(id));
		wrap.appendChild(el('button', { class: 'link-btn link-btn--left', onClick: openEmergency }, ['Quali sintomi sono gravi?']));
		return wrap;
	}

	function notifHint() {
		if (!('Notification' in window)) return 'Il timer dura 3 ore (osserva almeno 2).';
		if (state.notif && Notification.permission === 'granted') return 'Il timer dura 3 ore. Ti avviso alla fine (se l\'app resta aperta).';
		return 'Il timer dura 3 ore. Attiva i promemoria in Impostazioni per l\'avviso.';
	}
	function startObs(id) {
		const log = allergenLog(id);
		log.ossStart = Date.now();
		log.somministrato = true;
		save();
		render();
	}
	function renderObsTimer(id, nome) {
		const log = allergenLog(id);
		if (!log.ossStart) {
			return el('div', { class: 'obs-timer' }, [
				el('button', { class: 'btn btn--sm btn--block', onClick: () => startObs(id) }, ['▶ Ho dato ' + (nome || 'l\'alimento') + ': avvia il timer']),
				el('div', { class: 'tiny', style: 'margin-top:6px;text-align:center;' }, [notifHint()]),
			]);
		}
		const end = log.ossStart + OSS_MS;
		const done = Date.now() >= end;
		return el('div', { class: 'obs-timer' }, [
			el('div', { class: 'obs-timer__row' }, [
				el('div', { class: 'js-timer' + (done ? ' done' : ''), 'data-end': String(end), 'data-id': id }, [
					el('div', { class: 'bar' }, [el('span', { class: 'js-timer-bar', style: 'width:0%' })]),
					el('div', { class: 'js-timer-text tiny', style: 'margin-top:4px;font-weight:700;' }, [done ? '✅ Osservazione completata (3h)' : '…']),
				]),
				el('button', { class: 'icon-btn', title: 'Azzera timer', onClick: () => { if (window.confirm('Azzerare il timer? Perderai l\'orario di somministrazione.')) { delete log.ossStart; delete log.notified; save(); render(); } } }, ['↺']),
			]),
		]);
	}

	function renderReaction(id) {
		const log = allergenLog(id);
		const started = !!log.ossStart || !!log.somministrato;
		const setReaction = (val) => {
			if (val === 'grave' && !window.confirm('Segnalare una reazione GRAVE? Comparirà l\'avviso di emergenza.')) return;
			log.somministrato = true;
			log.reazione = val;
			log.reazioneOra = new Date().toISOString();
			save();
			render();
		};
		const opt = (val, cls, label) =>
			el('button', { class: cls + ' rchip', 'aria-pressed': String(log.reazione === val), disabled: started ? null : 'disabled', onClick: () => started && setReaction(val) }, [label]);
		const children = [
			el('div', { class: 'reaction' }, [
				el('span', { class: 'tiny reaction__lbl' }, [started ? 'Com\'è andata?' : 'Da segnare a fine osservazione:']),
				el('div', { class: 'chip-select' }, [opt('nessuna', 'ok', '✅ Nessuna'), opt('lieve', 'mild', '⚠️ Lieve'), opt('grave', 'bad', '🚨 Grave')]),
				log.reazioneOra ? el('span', { class: 'tiny' }, ['ore ' + formatDateTime(log.reazioneOra)]) : null,
			]),
		];
		if (log.reazione === 'grave') {
			children.push(el('div', { class: 'callout callout--danger', style: 'margin:10px 0 0;' }, [
				el('h3', {}, ['🚨 Reazione grave — agisci ora']),
				el('ul', { style: 'margin:0;padding-left:18px;' }, [
					el('li', {}, ['Respiro difficile, gonfiore volto/labbra, bimba floscia → chiama il 112.']),
					el('li', {}, ['Negli altri casi → sospendi l\'alimento e chiama il pediatra oggi stesso.']),
					el('li', {}, ['Gli altri allergeni già tollerati proseguono come da piano.']),
				]),
				el('button', { class: 'btn btn--block btn--danger-solid', style: 'margin-top:8px;', onClick: openEmergency }, ['Apri la scheda emergenza']),
			]));
		} else if (log.reazione === 'lieve') {
			children.push(el('div', { class: 'callout callout--gold', style: 'margin:10px 0 0;' }, [
				el('div', {}, ['Reazione lieve: osserva l\'evoluzione. Se peggiora o si ripete, sospendi l\'alimento e senti il pediatra prima di riproporlo.']),
			]));
		}
		if (log.reazione === 'lieve' || log.reazione === 'grave') {
			const st = el('textarea', { class: 'note-field', style: 'margin-top:10px;min-height:48px;', placeholder: 'Sintomi osservati (es. rossore attorno alla bocca, ponfi…)' });
			st.value = log.sintomi || '';
			st.addEventListener('input', () => { log.sintomi = st.value; save(); });
			children.push(st);
		}
		return el('div', {}, children);
	}

	function toggleMeal(n, key) {
		const ds = dayState(n);
		ds.meals[key] = !ds.meals[key];
		if (ds.meals[key] && key === 'mattino') {
			const g = D.GIORNI[n - 1];
			const a = g.allergeni.find((x) => x.momento === 'mattino' && x.osserva);
			if (a) {
				const log = allergenLog(`${a.nome}-g${n}`);
				if (!log.ossStart) { log.ossStart = Date.now(); log.somministrato = true; }
			}
		}
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
	function shortNovita(s) {
		if (!s) return null;
		const t = s.toLowerCase();
		if (t.indexOf('carne') >= 0) return 'Carne';
		if (t.indexOf('frutta') >= 0) return 'Frutta';
		if (t.indexOf('cereali') >= 0) return 'Cereali';
		return null;
	}
	function renderCalendario() {
		const root = document.getElementById('view-calendario');
		root.innerHTML = '';
		const todayN = currentDayNumber();

		let completed = 0;
		for (let i = 1; i <= TOTAL_DAYS; i++) if (dayComplete(i)) completed++;
		const pct = Math.round((completed / TOTAL_DAYS) * 100);
		root.appendChild(el('div', { class: 'cal-top' }, [
			el('div', { class: 'progress-row' }, [
				el('span', { class: 'tiny', style: 'font-weight:700;min-width:70px;' }, [`${completed}/${TOTAL_DAYS} · ${pct}%`]),
				el('div', { class: 'bar' }, [el('span', { style: `width:${pct}%` })]),
			]),
			!state.startDate ? el('button', { class: 'btn btn--sm', style: 'margin-top:10px;', onClick: () => navigate('oggi') }, ['Imposta data di inizio']) : null,
		]));

		root.appendChild(el('div', { class: 'cal-legend' }, [
			el('span', {}, [el('span', { class: 'k k--today' }), 'oggi']),
			el('span', {}, [el('span', { class: 'k k--done' }), 'fatto']),
			el('span', { class: 'tone-allergen' }, ['● allergene']),
			el('span', { class: 'tone-new' }, ['● novità']),
		]));

		const titles = { 1: 'Avvio, pranzo unico', 2: 'Uovo, poi pesce', 3: 'Glutine · legumi', 4: 'Arachide · 2ª pappa' };
		[1, 2, 3, 4].forEach((w) => {
			const grid = el('div', { class: 'cal-grid' });
			D.GIORNI.filter((g) => g.settimana === w).forEach((g) => {
				const n = g.giorno;
				const complete = dayComplete(n);
				const intro = realAllergenIntro(g);
				let micro = null, tone = '';
				if (intro) { micro = intro.nome + (intro.tipo === 'escalation' ? ' 2ª' : ''); tone = 'allergen'; }
				else { const nv = shortNovita(g.nuovo); if (nv) { micro = nv; tone = 'new'; } }
				grid.appendChild(el('button', {
					class: 'cal-cell' + (micro ? ' has-label' : ''),
					'data-today': String(n === todayN),
					'data-complete': String(complete),
					'data-tone': tone,
					'aria-label': `Giorno ${n}${micro ? ' · ' + micro : ''}`,
					onClick: () => navigate('giorno', { day: n }),
				}, [
					el('span', { class: 'cal-cell__n' }, [String(n)]),
					micro ? el('span', { class: 'cal-cell__lbl' }, [micro]) : null,
					complete ? el('span', { class: 'cal-cell__check' }, ['✓']) : null,
				]));
			});
			root.appendChild(el('div', { class: 'cal-week' }, [
				el('div', { class: 'cal-week__label' }, [el('h3', {}, [`Settimana ${w}`]), el('span', { class: 'sub' }, [titles[w]])]),
				grid,
			]));
		});
	}

	/* ---------------- Render: DETTAGLIO GIORNO ---------------- */
	function renderGiorno() {
		const root = document.getElementById('view-giorno');
		root.innerHTML = '';
		const n = state.selectedDay || 1;
		const g = D.GIORNI[n - 1];
		const date = dateForDay(n);
		root.appendChild(el('div', { class: 'detail-head' }, [
			el('button', { class: 'icon-btn', title: 'Indietro', onClick: () => navigate('calendario') }, ['←']),
			el('div', { class: 'detail-head__title' }, [
				el('h2', {}, [`Giorno ${n}`]),
				el('div', { class: 'sub' }, [`Settimana ${g.settimana}${date ? ' · ' + formatDate(date) : ''}`]),
			]),
			el('button', { class: 'icon-btn', title: 'Precedente', disabled: n <= 1 ? 'disabled' : null, onClick: () => n > 1 && navigate('giorno', { day: n - 1 }) }, ['‹']),
			el('button', { class: 'icon-btn', title: 'Successivo', disabled: n >= TOTAL_DAYS ? 'disabled' : null, onClick: () => n < TOTAL_DAYS && navigate('giorno', { day: n + 1 }) }, ['›']),
		]));
		root.appendChild(renderDayContent(n, { hero: false }));
	}

	/* ---------------- Settimana ---------------- */
	function mealShort(g, pastoId) {
		const raw = g.pasti[pastoId];
		if (!raw) return null;
		const t = raw.toLowerCase();
		if (pastoId === 'mattino') {
			const nuovo = g.allergeni.find((a) => a.momento === 'mattino' && (a.tipo === 'nuovo' || a.tipo === 'escalation'));
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
		if (pastoId === 'pomeriggio') return { label: t.includes('frutta') ? 'Frutta' : 'Latte' };
		if (pastoId === 'sera') return t.includes('mini-pappa') ? { label: 'Mini-pappa', opt: true } : { label: 'Latte' };
		return { label: raw };
	}

	function renderSettimana() {
		const root = document.getElementById('view-settimana');
		root.innerHTML = '';
		const todayN = currentDayNumber();
		const currentWeek = todayN ? D.GIORNI[todayN - 1].settimana : 1;
		if (!state.viewWeek) state.viewWeek = currentWeek;
		const w = Math.max(1, Math.min(4, state.viewWeek));
		const titles = { 1: 'Avvio, pranzo unico', 2: 'Uovo, poi pesce', 3: 'Glutine · legumi', 4: 'Arachide · 2ª pappa' };
		const weekDays = D.GIORNI.filter((g) => g.settimana === w);
		const first = weekDays[0].giorno, last = weekDays[weekDays.length - 1].giorno;
		const dFirst = dateForDay(first), dLast = dateForDay(last);

		root.appendChild(el('div', { class: 'wk-switch' }, [
			el('button', { class: 'icon-btn', title: 'Settimana precedente', disabled: w <= 1 ? 'disabled' : null, onClick: () => { state.viewWeek = w - 1; save(); render(); } }, ['‹']),
			el('div', { class: 'wk-switch__mid' }, [
				el('div', { class: 'wk-switch__title' }, [`Settimana ${w}`, w === currentWeek ? el('span', { class: 'badge badge--done', style: 'margin-left:8px;' }, ['in corso']) : null]),
				el('div', { class: 'wk-switch__sub' }, [`${titles[w]} · Giorni ${first}-${last}${dFirst ? ' (' + formatDateShort(dFirst) + '–' + formatDateShort(dLast) + ')' : ''}`]),
			]),
			el('button', { class: 'icon-btn', title: 'Settimana successiva', disabled: w >= 4 ? 'disabled' : null, onClick: () => { state.viewWeek = w + 1; save(); render(); } }, ['›']),
		]));

		/* Ancore */
		if (!state.shopping[w]) state.shopping[w] = {};
		const shopState = state.shopping[w];
		const wk = D.SPESA_SETTIMANE.find((s) => s.settimana === w);
		let bought = 0, totalItems = 0;
		wk.categorie.forEach((c) => c.items.forEach((it) => { totalItems++; if (shopState[it]) bought++; }));
		const scrollTo = (sel) => { const t = root.querySelector(sel); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
		root.appendChild(el('div', { class: 'anchors' }, [
			el('button', { class: 'anchor', onClick: () => scrollTo('#a-pasti') }, ['🍽️ Pasti']),
			el('button', { class: 'anchor', onClick: () => scrollTo('#a-spesa') }, [`🛒 Spesa ${bought}/${totalItems}`]),
			el('button', { class: 'anchor', onClick: () => scrollTo('#a-prep') }, ['🧊 Prep']),
		]));
		if (w !== currentWeek) {
			root.appendChild(el('button', { class: 'link-btn', onClick: () => { state.viewWeek = currentWeek; save(); render(); } }, ['↩︎ Torna alla settimana in corso']));
		}

		/* Pasti — deviazioni evidenziate, giorni standard compatti */
		root.appendChild(el('div', { class: 'section-title', id: 'a-pasti' }, ['Cosa mangia questa settimana']));
		const planCard = el('div', { class: 'card', style: 'padding:4px 12px;' });
		weekDays.forEach((g) => {
			const n = g.giorno;
			const date = dateForDay(n);
			const morningAllergen = g.allergeni.find((a) => a.momento === 'mattino');
			const deviation = !!morningAllergen || !!g.nuovo;
			const complete = dayComplete(n);
			const dayLabel = el('div', { class: 'day-row__day' }, [
				el('div', { class: 'n' }, [`G${n}`]),
				date ? el('div', { class: 'd' }, [date.toLocaleDateString('it-IT', { weekday: 'short' })]) : null,
			]);
			const status = complete ? el('span', { class: 'day-row__done', title: 'Completato' }, ['✓']) : n === todayN ? el('span', { class: 'badge badge--done' }, ['OGGI']) : null;
			if (deviation) {
				const chips = D.PASTI_ORDINE.map((p) => {
					const s = mealShort(g, p.id);
					return s ? el('span', { class: 'meal-chip' + (s.allergen ? ' allergen' : '') + (s.opt ? ' opt' : '') }, [el('span', { class: 'me' }, [p.emoji]), s.label]) : null;
				}).filter(Boolean);
				planCard.appendChild(el('div', { class: 'day-row', 'data-today': String(n === todayN), onClick: () => navigate('giorno', { day: n }) }, [dayLabel, el('div', { class: 'day-row__meals' }, chips), status]));
			} else {
				planCard.appendChild(el('div', { class: 'day-row day-row--std', 'data-today': String(n === todayN), onClick: () => navigate('giorno', { day: n }) }, [
					dayLabel,
					el('div', { class: 'day-row__std tiny' }, ['Giornata standard · Latte · Pappa + carne · Frutta']),
					status,
				]));
			}
		});
		root.appendChild(planCard);

		/* Spesa */
		root.appendChild(el('div', { class: 'section-title', id: 'a-spesa' }, [`Lista della spesa · ${bought}/${totalItems}`]));
		const shopCard = el('div', { class: 'card' });
		shopCard.appendChild(el('div', { class: 'progress-row', style: 'margin-bottom:8px;' }, [
			el('div', { class: 'bar' }, [el('span', { style: `width:${totalItems ? Math.round((bought / totalItems) * 100) : 0}%` })]),
			el('button', { class: 'link-btn', style: 'margin:0;padding:0;width:auto;font-size:12px;', onClick: () => { const allOn = bought === totalItems; wk.categorie.forEach((c) => c.items.forEach((it) => { shopState[it] = !allOn; })); save(); render(); } }, [bought === totalItems ? 'Azzera' : 'Segna tutto']),
		]));
		wk.categorie.forEach((catg) => {
			shopCard.appendChild(el('div', { class: 'shop-cat' }, [`${catg.emoji} ${catg.nome}`]));
			catg.items.forEach((item) => {
				shopCard.appendChild(checkRow({ checked: !!shopState[item], compact: true, onToggle: () => { shopState[item] = !shopState[item]; save(); render(); }, title: [item] }));
			});
		});
		root.appendChild(shopCard);

		/* Prep */
		root.appendChild(el('div', { class: 'section-title', id: 'a-prep' }, ['Preparazione & conservazione']));
		root.appendChild(el('div', { class: 'card' }, [el('ul', { class: 'bullet' }, D.PREP_TIPS.map((t) => el('li', {}, [t])))]));
	}

	/* ---------------- Allergeni ---------------- */
	function reactionLabel(r) {
		if (r === 'nessuna') return '✅ Nessuna';
		if (r === 'lieve') return '⚠️ Lieve';
		if (r === 'grave') return '🚨 Grave';
		return null;
	}
	function tipoLabel(t) {
		if (t === 'nuovo') return 'Nuovo';
		if (t === 'escalation') return '2ª dose';
		return 'Mantenimento';
	}
	function emojiFor(nome) {
		const m = D.ALLERGENI_RIEPILOGO.find((a) => a.nome === nome);
		return m ? m.emoji : '•';
	}
	function introDayAllergenId(nome, day) {
		const g = D.GIORNI[day - 1];
		if (!g) return null;
		const found = g.allergeni.find((a) => a.nome === nome);
		return found ? `${nome}-g${day}` : null;
	}

	function renderAllergeni() {
		const root = document.getElementById('view-allergeni');
		root.innerHTML = '';

		root.appendChild(el('div', { class: 'btn-row', style: 'margin-bottom:4px;' }, [
			el('button', { class: 'btn btn--soft btn--block', onClick: exportDiario }, ['🖨️ Diario per il pediatra']),
		]));

		root.appendChild(el('div', { class: 'callout callout--info' }, [
			el('div', {}, ['🕐 Allergeni sempre al mattino, osservando 2-3 ore. Mai due allergeni nuovi lo stesso giorno; ≥48-72h tra uno e il successivo. ', el('button', { class: 'inline-link', onClick: () => navigate('guida') }, ['Regole complete'])]),
		]));

		root.appendChild(el('div', { class: 'section-title' }, ['Stato degli allergeni']));
		const card = el('div', { class: 'card', style: 'padding:6px;' });
		D.ALLERGENI_RIEPILOGO.forEach((a) => {
			const introId = introDayAllergenId(a.nome, a.prima);
			const log = introId ? state.allergens[introId] : null;
			const introdotto = log && log.somministrato;
			let stato;
			if (!a.allergeneVero) stato = el('span', { class: 'badge badge--maint' }, ['ferro']);
			else if (introdotto && log.reazione) stato = el('span', { class: 'badge ' + (log.reazione === 'grave' ? 'badge--bad' : log.reazione === 'lieve' ? 'badge--allergen' : 'badge--done') }, [reactionLabel(log.reazione)]);
			else if (introdotto) stato = el('span', { class: 'badge badge--done' }, ['✓ Introdotto']);
			else stato = el('span', { class: 'badge badge--week' }, ['Da introdurre']);
			const row = el('div', { class: 'allergen-item' + (a.allergeneVero ? ' tappable' : ''), onClick: a.allergeneVero ? () => navigate('giorno', { day: a.prima }) : null }, [
				el('div', { class: 'allergen-item__emoji' }, [a.emoji]),
				el('div', { class: 'allergen-item__main' }, [
					el('div', { class: 'allergen-item__name' }, [a.nome, stato]),
					el('div', { class: 'allergen-item__meta' }, [`1ª volta: Giorno ${a.prima} · ${a.orario} · poi ${a.freqBreve}`]),
				]),
				a.allergeneVero ? el('span', { class: 'allergen-item__go' }, ['›']) : null,
			]);
			card.appendChild(row);
		});
		root.appendChild(card);

		/* Timeline: solo Nuovo/2ª in evidenza, mantenimenti compatti */
		root.appendChild(el('div', { class: 'section-title' }, ['Calendario allergeni']));
		const tl = el('div', { class: 'card', style: 'padding:6px;' });
		D.GIORNI.forEach((g) => {
			g.allergeni.forEach((a) => {
				const id = `${a.nome}-g${g.giorno}`;
				const log = state.allergens[id] || {};
				const date = dateForDay(g.giorno);
				const isMaint = a.tipo === 'mantenimento';
				tl.appendChild(el('div', { class: 'tl-row' + (isMaint ? ' tl-row--maint' : ''), onClick: () => navigate('giorno', { day: g.giorno }) }, [
					el('span', { class: 'tl-row__emoji' }, [emojiFor(a.nome)]),
					el('div', { class: 'tl-row__main' }, [
						el('div', { class: 'tl-row__title' }, [
							`${a.nome} · G${g.giorno}`,
							!isMaint ? el('span', { class: 'badge badge--allergen', style: 'margin-left:6px;' }, [tipoLabel(a.tipo)]) : el('span', { class: 'tl-maint-tag tiny' }, ['mantenimento']),
						]),
						el('div', { class: 'tiny' }, [`${cap(a.momento)}${date ? ' · ' + formatDateShort(date) : ''}${log.reazione ? ' · ' + reactionLabel(log.reazione) : ''}`]),
					]),
					el('span', { class: 'allergen-item__go' }, ['›']),
				]));
			});
		});
		root.appendChild(tl);
	}

	/* ---------------- Guida ---------------- */
	function renderGuida() {
		const root = document.getElementById('view-guida');
		root.innerHTML = '';
		root.dataset.built = '';

		/* Emergenza in cima */
		root.appendChild(el('div', { class: 'callout callout--danger', style: 'margin-top:0;' }, [
			el('h3', {}, ['🚨 Segnali d\'allarme']),
			el('ul', { style: 'margin:0 0 10px;padding-left:18px;' }, D.SEGNALI_ALLARME.map((s) => el('li', {}, [s.testo]))),
			el('button', { class: 'btn btn--block btn--danger-solid', onClick: openEmergency }, ['Apri la scheda emergenza']),
		]));

		/* Dove trovo cosa */
		root.appendChild(el('div', { class: 'section-title' }, ['Dove trovo cosa']));
		root.appendChild(el('div', { class: 'card', style: 'padding:6px;' }, D.DOVE_TROVO.map((x) =>
			el('div', { class: 'intro-map__row', style: 'padding:8px 6px;border-bottom:1px solid var(--c-border);' }, [el('span', { class: 'im-ico' }, [x.icona]), el('span', {}, [el('strong', {}, [x.nome + ' ']), el('span', { class: 'tiny' }, ['· ' + x.desc])])]),
		)));

		root.appendChild(el('div', { class: 'callout callout--gold' }, [
			el('h3', {}, ['⭐ Regole d\'oro']),
			el('ul', {}, D.REGOLE_ORO.map((r) => el('li', {}, [r]))),
		]));

		root.appendChild(el('div', { class: 'section-title' }, ['Pappa base']));
		root.appendChild(el('div', { class: 'card' }, [
			el('ul', { class: 'bullet', style: 'margin:0;' }, D.PAPPA_BASE.ingredienti.map((i) => el('li', {}, [i]))),
			el('p', { class: 'tiny', style: 'margin:8px 0 0;' }, [D.PAPPA_BASE.nota]),
		]));

		root.appendChild(el('div', { class: 'section-title' }, ['Note operative']));
		const ul = el('ul', { class: 'rule-list' });
		D.NOTE_OPERATIVE.forEach((n, i) => {
			ul.appendChild(el('li', {}, [el('span', { class: 'k' }, [String(i + 1) + '.']), el('div', { class: 't' }, [el('strong', {}, [n.titolo]), el('span', {}, [n.testo])])]));
		});
		root.appendChild(el('div', { class: 'card' }, [ul]));

		root.appendChild(el('div', { class: 'section-title' }, ['Glossario']));
		const gl = el('div', { class: 'card' });
		D.GLOSSARIO.forEach((g) => gl.appendChild(el('div', { class: 'gloss' }, [el('strong', {}, [g.termine]), el('span', {}, [g.def])])));
		root.appendChild(gl);

		root.appendChild(el('div', { class: 'disclaimer' }, [
			'Strumento di supporto basato su ESPGHAN 2017, EFSA 2015/2019, WHO 2023, consensus SIPPS-FIMP 2022, studi LEAP/LEAP-On/PETIT. Non sostituisce il pediatra: adatta il piano alla crescita e alla storia clinica della bambina.',
		]));
	}

	/* ---------------- Impostazioni ---------------- */
	function groupCard(icon, title, bodyChildren, opts) {
		opts = opts || {};
		return el('div', { class: 'group' }, [
			el('div', { class: 'group__header' }, [el('span', { class: 'gi', 'aria-hidden': 'true' }, [icon]), el('div', {}, [el('h3', {}, [title]), opts.subtitle ? el('div', { class: 'gsub' }, [opts.subtitle]) : null])]),
			el('div', { class: 'group__body' + (opts.pad ? ' pad' : '') }, bodyChildren),
		]);
	}
	function renderImpostazioni() {
		const root = document.getElementById('view-impostazioni');
		root.innerHTML = '';
		const notifState = 'Notification' in window ? Notification.permission : 'unsupported';

		/* Aspetto */
		const zoomBtn = (val, label) => el('button', { 'aria-pressed': String((state.zoom || 1) === val), onClick: () => { state.zoom = val; applyZoom(); save(); render(); } }, [label]);
		root.appendChild(groupCard('🔎', 'Aspetto', [
			el('div', { class: 'gsub', style: 'margin-bottom:8px;' }, ['Dimensione del testo']),
			el('div', { class: 'seg' }, [zoomBtn(1, 'Normale'), zoomBtn(1.15, 'Grande'), zoomBtn(1.3, 'Molto grande')]),
		], { pad: true }));

		/* Emergenza: numero pediatra */
		const telInput = el('input', { type: 'tel', inputmode: 'tel', placeholder: 'es. 06 1234567', value: state.pediatra || '', 'aria-label': 'Numero pediatra' });
		telInput.addEventListener('input', () => { state.pediatra = telInput.value; save(); });
		root.appendChild(groupCard('🚑', 'Emergenza', [
			el('div', { class: 'gsub', style: 'margin-bottom:6px;' }, ['Numero del pediatra (compare nella scheda 🚨)']),
			el('div', { class: 'field', style: 'margin-bottom:8px;' }, [telInput]),
			el('button', { class: 'btn btn--sm btn--block btn--soft', onClick: openEmergency }, ['Apri scheda emergenza']),
		], { pad: true }));

		/* Promemoria + diario */
		root.appendChild(groupCard('🔔', 'Promemoria e diario', [
			el('div', { class: 'setting-row' }, [
				el('div', {}, [el('strong', {}, ['Promemoria browser']), el('div', { class: 'tiny' }, ['Avviso a fine osservazione (ad app aperta o installata).'])]),
				notifState === 'unsupported' ? el('span', { class: 'tiny' }, ['Non supportato']) : el('button', { class: 'btn btn--sm' + (state.notif && notifState === 'granted' ? '' : ' btn--soft'), onClick: async () => { try { const perm = await Notification.requestPermission(); state.notif = perm === 'granted'; } catch (e) { state.notif = false; } save(); render(); } }, [state.notif && notifState === 'granted' ? '✅ Attivi' : 'Attiva']),
			]),
			el('div', { class: 'setting-row' }, [
				el('div', {}, [el('strong', {}, ['Diario per il pediatra']), el('div', { class: 'tiny' }, ['Reazioni e note in una pagina stampabile (PDF).'])]),
				el('button', { class: 'btn btn--sm btn--soft', onClick: exportDiario }, ['🖨️ Apri']),
			]),
		]));

		/* Piano */
		const dayNow = currentDayNumber();
		root.appendChild(groupCard('🗓️', 'Piano', [
			el('div', { class: 'setting-row' }, [
				el('div', {}, [el('strong', {}, ['Data di inizio']), el('div', { class: 'tiny' }, [state.startDate ? cap(formatDate(parseISO(state.startDate))) : 'Non impostata'])]),
				el('button', { class: 'btn btn--ghost-neutral btn--sm', onClick: changeStartDate }, ['Cambia']),
			]),
			el('div', { class: 'setting-row' }, [
				el('div', {}, [el('strong', {}, ['Sposta il piano']), el('div', { class: 'tiny' }, [dayNow ? `Oggi è il Giorno ${dayNow}` : 'Se salti o rimandi un giorno'])]),
				el('button', { class: 'btn btn--ghost-neutral btn--sm', disabled: state.startDate ? null : 'disabled', onClick: openShiftSheet }, ['Sposta']),
			]),
		]));

		/* Dati */
		const importInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none;' });
		importInput.addEventListener('change', (e) => importData(e.target.files && e.target.files[0]));
		root.appendChild(groupCard('💾', 'Dati e backup', [
			el('div', { class: 'callout callout--info', style: 'margin:0 0 12px;font-size:13px;' }, ['Questi dati sono salvati solo su questo telefono. Per condividerli con l\'altro genitore, esporta il file e importalo sull\'altro dispositivo.']),
			el('div', { class: 'btn-row', style: 'margin-bottom:2px;' }, [
				el('button', { class: 'btn btn--sm', onClick: exportData }, ['⬇️ Esporta']),
				el('button', { class: 'btn btn--sm btn--soft', onClick: () => importInput.click() }, ['⬆️ Importa']),
				importInput,
			]),
			el('div', { class: 'setting-row' }, [
				el('div', {}, [el('strong', {}, ['Azzera tutti i dati']), el('div', { class: 'tiny' }, ['Cancella spunte, note e reazioni. Irreversibile.'])]),
				el('button', { class: 'btn btn--danger-ghost btn--sm', onClick: resetData }, ['Azzera']),
			]),
		], { pad: true }));

		root.appendChild(el('div', { class: 'disclaimer' }, ['Tutti i dati restano sul tuo dispositivo (nessun account, nessun server).']));
	}

	function applyZoom() {
		try { document.documentElement.style.zoom = String(state.zoom || 1); } catch (e) {}
	}

	/* ---------------- Diario / Export / Import ---------------- */
	function countChecks(s) {
		let c = 0;
		Object.keys(s.days || {}).forEach((k) => { const d = s.days[k]; if (d) { c += Object.values(d.meals || {}).filter(Boolean).length + Object.values(d.rules || {}).filter(Boolean).length; } });
		return c;
	}
	function countReactions(s) {
		return Object.values(s.allergens || {}).filter((l) => l && l.reazione).length;
	}
	function exportDiario() {
		const rows = [];
		D.GIORNI.forEach((g) => g.allergeni.forEach((a) => {
			const id = `${a.nome}-g${g.giorno}`;
			const log = state.allergens[id];
			if (log && (log.reazione || log.somministrato)) {
				const date = dateForDay(g.giorno);
				rows.push(`<tr><td>G${g.giorno}${date ? ' · ' + formatDateShort(date) : ''}</td><td>${a.nome} (${tipoLabel(a.tipo)})</td><td>${reactionLabel(log.reazione) || 'somministrato'}</td><td>${log.reazioneOra ? formatDateTime(log.reazioneOra) : ''}</td><td>${escapeHtml(log.sintomi || '')}</td></tr>`);
			}
		}));
		const notes = [];
		Object.keys(state.days || {}).forEach((k) => {
			const nd = state.days[k];
			if (nd && nd.note && nd.note.trim()) { const date = dateForDay(Number(k)); notes.push(`<tr><td>G${k}${date ? ' · ' + formatDateShort(date) : ''}</td><td>${escapeHtml(nd.note)}</td></tr>`); }
		});
		const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Diario svezzamento</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;max-width:800px;margin:24px auto;padding:0 16px;}h1{font-size:20px;}h2{font-size:15px;margin-top:24px;border-bottom:2px solid #4a8c6f;padding-bottom:4px;}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top;}th{background:#f0ede4;}.muted{color:#666;font-size:12px;}@media print{button{display:none;}}</style></head><body>
<h1>🍼 Diario svezzamento</h1>
<p class="muted">Inizio: ${state.startDate ? cap(formatDate(parseISO(state.startDate))) : '—'} · Generato per la visita pediatrica.</p>
<button onclick="window.print()" style="padding:8px 14px;border:none;background:#4a8c6f;color:#fff;border-radius:6px;font-weight:700;cursor:pointer;">🖨️ Stampa / Salva PDF</button>
<h2>Allergeni e reazioni</h2>
${rows.length ? `<table><thead><tr><th>Giorno</th><th>Allergene</th><th>Esito</th><th>Ora</th><th>Sintomi</th></tr></thead><tbody>${rows.join('')}</tbody></table>` : '<p class="muted">Nessuna somministrazione registrata.</p>'}
<h2>Note giornaliere</h2>
${notes.length ? `<table><thead><tr><th>Giorno</th><th>Nota</th></tr></thead><tbody>${notes.join('')}</tbody></table>` : '<p class="muted">Nessuna nota.</p>'}
<p class="muted" style="margin-top:24px;">Strumento di supporto, non sostituisce il parere del pediatra.</p></body></html>`;
		const win = window.open('', '_blank');
		if (win) { win.document.open(); win.document.write(html); win.document.close(); }
		else downloadBlob(html, 'diario-svezzamento.html', 'text/html');
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
			setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
		} catch (e) { window.alert('Impossibile esportare su questo browser.'); }
	}
	function exportData() {
		downloadBlob(JSON.stringify(state, null, 2), `svezzamento-backup-${toISO(todayMidnight())}.json`, 'application/json');
	}
	function importData(file) {
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				const data = JSON.parse(String(reader.result));
				if (typeof data !== 'object' || data === null) throw new Error('formato');
				const ok = window.confirm(`Importare questo backup SOSTITUIRÀ i dati di questo telefono (${countChecks(state)} spunte, ${countReactions(state)} reazioni). Continuare?`);
				if (!ok) return;
				state = Object.assign(defaultState(), data);
				save();
				applyZoom();
				window.alert('Dati importati.');
				navigate('oggi');
			} catch (e) { window.alert('File non valido: impossibile importare.'); }
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

	/* ---------------- Dispatcher ---------------- */
	function render() {
		if (currentView === 'oggi') renderOggi();
		else if (currentView === 'calendario') renderCalendario();
		else if (currentView === 'giorno') renderGiorno();
		else if (currentView === 'settimana') renderSettimana();
		else if (currentView === 'allergeni') renderAllergeni();
		else if (currentView === 'guida') renderGuida();
		else if (currentView === 'impostazioni') renderImpostazioni();
		renderGlobalBanner();
		renderTimerChip();
		refreshTickers();
		updateHeaderSubtitle();
	}

	function updateHeaderSubtitle() {
		const sub = document.getElementById('header-sub');
		if (!sub) return;
		const n = currentDayNumber();
		sub.textContent = n ? `Giorno ${n} di ${TOTAL_DAYS} · Settimana ${D.GIORNI[n - 1].settimana}` : 'Calendario 28 giorni';
	}

	/* ---------------- Init ---------------- */
	let lastDay = null;
	function handleWake() {
		const n = rawDayNumber();
		if (n !== lastDay) { lastDay = n; render(); }
		else if (currentView === 'oggi' || currentView === 'giorno') render();
	}
	function init() {
		applyZoom();
		lastDay = rawDayNumber();
		document.querySelectorAll('.nav__btn').forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)));
		const gear = document.getElementById('settings-btn');
		if (gear) gear.addEventListener('click', () => navigate('impostazioni'));
		const sos = document.getElementById('sos-btn');
		if (sos) sos.addEventListener('click', openEmergency);
		document.addEventListener('visibilitychange', () => { if (!document.hidden) handleWake(); });
		window.addEventListener('focus', handleWake);
		navigate('oggi');
		if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
	}
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
	else init();
})();
