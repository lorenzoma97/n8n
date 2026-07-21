/*
 * Calendario svezzamento — dati strutturati (giorni 1-28, versione DEFINITIVA post-QA)
 * Fonte: guida basata su ESPGHAN 2017, EFSA 2015/2019, WHO 2023, consensus SIPPS-FIMP 2022,
 * studi LEAP/LEAP-On/PETIT e dati FITS (Abrams 2021).
 *
 * NB: strumento di supporto, NON sostituisce il parere del pediatra curante.
 */

/* Regole fisse: valgono TUTTI i 28 giorni.
 * pasto: a quale pasto "appartiene" la regola (folded lì nella vista Oggi);
 *        null = vale per tutta la giornata (blocco separato).
 * breve: etichetta corta per la chip sotto il pasto. */
const REGOLE_FISSE = [
	{
		id: 'vitD',
		icona: '💧',
		pasto: null,
		breve: 'Vitamina D',
		titolo: 'Vitamina D 400 UI (10 µg)',
		dettaglio: '1 volta al giorno, tutti i giorni. Conferma prodotto e dose col pediatra.',
	},
	{
		id: 'cereale',
		icona: '🌾',
		pasto: 'pranzo',
		breve: 'cereale con ferro',
		titolo: 'Cereale con ferro',
		dettaglio:
			'In ogni pappa. Verifica in etichetta la voce "Ferro" (~8 mg/100g, es. Nestlé MIO): è il veicolo di ferro n.1 del mese.',
	},
	{
		id: 'vitC',
		icona: '🍊',
		pasto: 'pranzo',
		breve: '+ vit C',
		titolo: 'Fonte di vitamina C',
		dettaglio:
			'Verdura/frutta fresca nello stesso pasto di cereale/legumi: aiuta ad assorbire molto più ferro.',
	},
	{
		id: 'olio',
		icona: '🫒',
		pasto: 'pranzo',
		breve: '+ olio 5g',
		titolo: 'Olio EVO ~5 g (1 cucchiaino)',
		dettaglio: 'A crudo, in ogni pappa.',
	},
	{
		id: 'poppate',
		icona: '🍼',
		pasto: null,
		breve: 'Poppate',
		titolo: 'Allattamento a richiesta (~4-6 al giorno)',
		dettaglio: 'La pappa integra, non sostituisce le poppate in queste settimane.',
	},
];

/*
 * Ogni giorno:
 *  - pasti: mattino / pranzo / pomeriggio / sera (null se non previsto)
 *  - seraOpzionale: true nella settimana 4 (mini-pappa facoltativa)
 *  - nuovo: alimento nuovo introdotto (badge), null se nessuno
 *  - allergeni: eventi allergene del giorno [{ nome, momento, tipo, osserva }]
 *      tipo: 'nuovo' | 'escalation' | 'mantenimento'
 *      osserva: richiede osservazione 2-3h dopo la somministrazione
 *  - nota: nota specifica del giorno (null se assente)
 */
const GIORNI = [
	// ---- SETTIMANA 1 — avvio, pranzo unico ----
	{
		giorno: 1,
		settimana: 1,
		pasti: {
			mattino: 'Latte',
			pranzo:
				'Pappa: verdure + crema di cereali fortificata (2 cucchiai) + olio EVO. ~5-6 cucchiaini, poi latte.',
			pomeriggio: 'Latte',
			sera: 'Latte',
		},
		nuovo: 'Cereali fortificati + verdure',
		allergeni: [],
		nota: 'Primo giorno: parti con poche cucchiaiate, senza forzare. La pappa integra il latte.',
	},
	{
		giorno: 2,
		settimana: 1,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Stessa pappa di ieri; arriva a 7-8 cucchiaini se gradita.',
			pomeriggio: 'Latte',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 3,
		settimana: 1,
		pasti: {
			mattino: 'Latte',
			pranzo:
				'Pappa base + carne omogeneizzata 10 g (preferisci manzo/vitello per il ferro; o coniglio/tacchino).',
			pomeriggio: 'Latte',
			sera: 'Latte',
		},
		nuovo: 'CARNE (ferro)',
		allergeni: [{ nome: 'Carne', momento: 'pranzo', tipo: 'nuovo', osserva: false }],
		nota: 'La carne non è un allergene: è la chiave del ferro. Da qui in poi è a (quasi) ogni pranzo.',
	},
	{
		giorno: 4,
		settimana: 1,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 10-15 g.',
			pomeriggio: 'Frutta (mela o pera) ~40 g.',
			sera: 'Latte',
		},
		nuovo: 'Frutta',
		allergeni: [],
		nota: null,
	},
	{
		giorno: 5,
		settimana: 1,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 15 g.',
			pomeriggio: 'Frutta 40-50 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 6,
		settimana: 1,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 15 g.',
			pomeriggio: 'Frutta 50 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 7,
		settimana: 1,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 15 g.',
			pomeriggio: 'Frutta 50-60 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},

	// ---- SETTIMANA 2 — consolida pranzo; UOVO, poi PESCE ----
	{
		giorno: 8,
		settimana: 2,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 15-20 g.',
			pomeriggio: 'Frutta 60 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 9,
		settimana: 2,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 60 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 10,
		settimana: 2,
		pasti: {
			mattino: 'UOVO ½ cucchiaino, intero ben sodo. Osserva 2-3h, poi latte.',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 60 g.',
			sera: 'Latte',
		},
		nuovo: 'UOVO',
		allergeni: [{ nome: 'Uovo', momento: 'mattino', tipo: 'nuovo', osserva: true }],
		nota: null,
	},
	{
		giorno: 11,
		settimana: 2,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 60 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 12,
		settimana: 2,
		pasti: {
			mattino: 'UOVO 1 cucchiaino, se la prima prova è andata bene. Osserva 2-3h, poi latte.',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 60 g.',
			sera: 'Latte',
		},
		nuovo: 'Uovo — 2ª esposizione',
		allergeni: [{ nome: 'Uovo', momento: 'mattino', tipo: 'escalation', osserva: true }],
		nota: null,
	},
	{
		giorno: 13,
		settimana: 2,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 60-70 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 14,
		settimana: 2,
		pasti: {
			mattino:
				'PESCE bianco 15-20 g (merluzzo/sogliola/platessa). Osserva 2-3h, poi latte.',
			pranzo: 'Pappa base + carne 15 g.',
			pomeriggio: 'Frutta 70 g.',
			sera: 'Latte',
		},
		nuovo: 'PESCE',
		allergeni: [{ nome: 'Pesce', momento: 'mattino', tipo: 'nuovo', osserva: true }],
		nota:
			'Pesce al mattino come allergene; la carne resta a pranzo per non far crollare il ferro della giornata. Pesce a basso mercurio: evita spada, squalo, marlin, tonno grande.',
	},

	// ---- SETTIMANA 3 — GLUTINE + LEGUMI + mantenimento ----
	{
		giorno: 15,
		settimana: 3,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base (cereale fortificato) + carne 20 g.',
			pomeriggio: 'Frutta 70 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: 'Niente glutine oggi: si mantiene una distanza ≥48h dal pesce (g.14).',
	},
	{
		giorno: 16,
		settimana: 3,
		pasti: {
			mattino:
				'GLUTINE: semolino/multicereale FORTIFICATO con ferro, piccola quantità. Osserva 2-3h, poi latte.',
			pranzo: 'Pappa base fortificata + carne 20 g.',
			pomeriggio: 'Frutta 70 g.',
			sera: 'Latte',
		},
		nuovo: 'GLUTINE',
		allergeni: [{ nome: 'Glutine', momento: 'mattino', tipo: 'nuovo', osserva: true }],
		nota:
			'Introduci il glutine con semolino/multicereale FORTIFICATO (es. Nestlé MIO Semolino), NON semolino/pastina comuni (senza ferro): così introduci il glutine senza perdere il veicolo di ferro.',
	},
	{
		giorno: 17,
		settimana: 3,
		pasti: {
			mattino: 'UOVO 1 cucchiaino (mantenimento).',
			pranzo:
				'Pappa base + carne 15 g + LEGUMI decorticati passati (lenticchie rosse) 10 g + fonte di vit. C.',
			pomeriggio: 'Frutta 70 g.',
			sera: 'Latte',
		},
		nuovo: 'LEGUMI',
		allergeni: [
			{ nome: 'Uovo', momento: 'mattino', tipo: 'mantenimento', osserva: false },
			{ nome: 'Legumi', momento: 'pranzo', tipo: 'nuovo', osserva: false },
		],
		nota: 'Legumi decorticati e passati + vit. C nello stesso pasto per l\'assorbimento del ferro.',
	},
	{
		giorno: 18,
		settimana: 3,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + pesce 20 g.',
			pomeriggio: 'Frutta 70 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [{ nome: 'Pesce', momento: 'pranzo', tipo: 'mantenimento', osserva: false }],
		nota: null,
	},
	{
		giorno: 19,
		settimana: 3,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 20 g + legumi 10-15 g + fonte di vit. C.',
			pomeriggio: 'Frutta 70-80 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [{ nome: 'Legumi', momento: 'pranzo', tipo: 'mantenimento', osserva: false }],
		nota: null,
	},
	{
		giorno: 20,
		settimana: 3,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [],
		nota: null,
	},
	{
		giorno: 21,
		settimana: 3,
		pasti: {
			mattino: 'UOVO 1 cucchiaino (mantenimento).',
			pranzo: 'Pappa base + pesce 20 g.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Latte',
		},
		nuovo: null,
		allergeni: [
			{ nome: 'Uovo', momento: 'mattino', tipo: 'mantenimento', osserva: false },
			{ nome: 'Pesce', momento: 'pranzo', tipo: 'mantenimento', osserva: false },
		],
		nota: null,
	},

	// ---- SETTIMANA 4 — ARACHIDE + 2ª pappa opzionale ----
	{
		giorno: 22,
		settimana: 4,
		pasti: {
			mattino:
				'ARACHIDE ¼-½ cucchiaino, crema 100% liscia molto diluita. Osserva 2-3h, poi latte.',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Mini-pappa serale opzionale.',
		},
		seraOpzionale: true,
		nuovo: 'ARACHIDE',
		allergeni: [{ nome: 'Arachide', momento: 'mattino', tipo: 'nuovo', osserva: true }],
		nota:
			'Solo crema 100% liscia e diluita, MAI frutta a guscio intera o in pezzi (rischio soffocamento). Obiettivo: arachide almeno 3 volte a settimana.',
	},
	{
		giorno: 23,
		settimana: 4,
		pasti: {
			mattino: 'UOVO 1 cucchiaino (mantenimento).',
			pranzo: 'Pappa base + pesce 20 g.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Mini-pappa 100 g (opzionale).',
		},
		seraOpzionale: true,
		nuovo: null,
		allergeni: [
			{ nome: 'Uovo', momento: 'mattino', tipo: 'mantenimento', osserva: false },
			{ nome: 'Pesce', momento: 'pranzo', tipo: 'mantenimento', osserva: false },
		],
		nota: 'Mini-pappa serale = verdure + cereale fortificato + olio. NON una 2ª proteina piena la sera.',
	},
	{
		giorno: 24,
		settimana: 4,
		pasti: {
			mattino: 'ARACHIDE ½-1 cucchiaino, se la prima prova è andata bene. Osserva 2-3h, poi latte.',
			pranzo: 'Pappa base + carne 20 g + legumi 10 g + fonte di vit. C.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Mini-pappa 100-120 g (opzionale).',
		},
		seraOpzionale: true,
		nuovo: 'Arachide — 2ª esposizione',
		allergeni: [
			{ nome: 'Arachide', momento: 'mattino', tipo: 'escalation', osserva: true },
			{ nome: 'Legumi', momento: 'pranzo', tipo: 'mantenimento', osserva: false },
		],
		nota: null,
	},
	{
		giorno: 25,
		settimana: 4,
		pasti: {
			mattino: 'UOVO 1 cucchiaino (mantenimento).',
			pranzo: 'Pappa base + carne 20 g.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Mini-pappa 100 g (opzionale).',
		},
		seraOpzionale: true,
		nuovo: null,
		allergeni: [{ nome: 'Uovo', momento: 'mattino', tipo: 'mantenimento', osserva: false }],
		nota: null,
	},
	{
		giorno: 26,
		settimana: 4,
		pasti: {
			mattino: 'ARACHIDE 1 cucchiaino (mantenimento).',
			pranzo: 'Pappa base + pesce 20 g.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Mini-pappa 100-120 g (opzionale).',
		},
		seraOpzionale: true,
		nuovo: '3ª somministrazione arachide',
		allergeni: [
			{ nome: 'Arachide', momento: 'mattino', tipo: 'mantenimento', osserva: false },
			{ nome: 'Pesce', momento: 'pranzo', tipo: 'mantenimento', osserva: false },
		],
		nota: 'Con oggi l\'arachide raggiunge le 3 volte a settimana (giorni 22, 24, 26).',
	},
	{
		giorno: 27,
		settimana: 4,
		pasti: {
			mattino: 'Latte',
			pranzo: 'Pappa base + carne 20 g + legumi 10 g + fonte di vit. C.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Mini-pappa 120 g (opzionale).',
		},
		seraOpzionale: true,
		nuovo: null,
		allergeni: [{ nome: 'Legumi', momento: 'pranzo', tipo: 'mantenimento', osserva: false }],
		nota: null,
	},
	{
		giorno: 28,
		settimana: 4,
		pasti: {
			mattino: 'ARACHIDE 1 cucchiaino (mantenimento).',
			pranzo: 'Pappa base + pesce o carne 20 g.',
			pomeriggio: 'Frutta 80 g.',
			sera: 'Mini-pappa 120 g (opzionale).',
		},
		seraOpzionale: true,
		nuovo: null,
		allergeni: [{ nome: 'Arachide', momento: 'mattino', tipo: 'mantenimento', osserva: false }],
		nota: 'Fine del 1° mese. Prosegui i mantenimenti e prenota l\'esame del sangue per il ferro (emoglobina e ferritina).',
	},
];

/* Riepilogo allergeni per la vista dedicata.
 * allergeneVero: false per la carne (non è un allergene, è la fonte di ferro).
 * freqBreve/quando: usati nella tabella dei mantenimenti a fine programma. */
const ALLERGENI_RIEPILOGO = [
	{
		nome: 'Carne',
		emoji: '🥩',
		allergeneVero: false,
		prima: 3,
		orario: 'Pranzo',
		quando: 'a pranzo',
		freqBreve: 'quasi ogni pranzo',
		mantenimento: 'Ogni pranzo (chiave del ferro, non un allergene)',
	},
	{
		nome: 'Uovo',
		emoji: '🥚',
		allergeneVero: true,
		prima: 10,
		orario: 'Mattino',
		quando: 'al mattino',
		freqBreve: '2 volte a settimana',
		mantenimento: '~2 volte a settimana (giorni 17, 21, 23, 25)',
	},
	{
		nome: 'Pesce',
		emoji: '🐟',
		allergeneVero: true,
		prima: 14,
		orario: 'Mattino',
		quando: 'a pranzo',
		freqBreve: '1-2 volte a settimana',
		mantenimento: '1-2 volte a settimana (a basso mercurio)',
	},
	{
		nome: 'Glutine',
		emoji: '🌾',
		allergeneVero: true,
		prima: 16,
		orario: 'Mattino',
		quando: 'nella pappa',
		freqBreve: 'ad ogni pappa',
		mantenimento: 'Regolare, tramite il cereale fortificato',
	},
	{
		nome: 'Legumi',
		emoji: '🫘',
		allergeneVero: true,
		prima: 17,
		orario: 'Pranzo',
		quando: 'a pranzo',
		freqBreve: '2-3 volte a settimana',
		mantenimento: '2-3 volte a settimana (decorticati e passati)',
	},
	{
		nome: 'Arachide',
		emoji: '🥜',
		allergeneVero: true,
		prima: 22,
		orario: 'Mattino',
		quando: 'al mattino',
		freqBreve: 'almeno 3 volte a settimana',
		mantenimento: 'Almeno 3 volte a settimana (giorni 22, 24, 26, 28)',
	},
];

/* Note operative (da leggere prima di iniziare) */
const NOTE_OPERATIVE = [
	{
		titolo: 'Etichetta cereale = check n.1',
		testo:
			'Deve riportare "Ferro" (~8 mg/100g, es. Nestlé MIO). NON usare creme "prime" senza ferro (Plasmon crema di riso, Mellin/Humana multicereali dichiarano solo vitamine B/C). Per il glutine, semolino FORTIFICATO (Nestlé MIO Semolino), non semolino comune.',
	},
	{
		titolo: 'Il ferro resta sotto il fabbisogno',
		testo:
			'Anche seguendo tutto alla lettera, nel 1° mese il ferro assorbito copre solo ~25-41% del fabbisogno: è normale nel bimbo allattato al seno. Prenota l\'esame del sangue per il ferro (emoglobina e ferritina); se sono bassi, il pediatra può prescrivere un\'integrazione di ferro (1 mg per kg al giorno).',
	},
	{
		titolo: 'Vitamina C',
		testo: 'Verdura/frutta fresca nello stesso pasto di legumi/cereale.',
	},
	{
		titolo: 'Proteine',
		testo:
			'Max 1 fonte proteica animale piena per pasto. Legumi + carne piccola (10-15 g) ok; niente 2ª proteina piena la sera. Non superare il 14% dell\'energia da proteine.',
	},
	{
		titolo: 'Conservazione',
		testo: 'Brodo/verdure in frigo ≤24-48h, oppure congelati in porzioni (cubetti).',
	},
	{
		titolo: 'Poppate',
		testo: '4-6 al giorno a richiesta; la pappa integra, non sostituisce.',
	},
];

/* Regole d'oro sempre valide (banner nella Guida) */
const REGOLE_ORO = [
	'Allergeni SEMPRE al mattino, in giorno tranquillo, osservando 2-3 ore.',
	'Mai due allergeni nuovi lo stesso giorno; ≥48-72h tra un allergene nuovo e il successivo.',
	'Un alimento nuovo per volta.',
	'Niente sale, zucchero, miele, dado/brodo salato, latte vaccino come bevanda.',
	'Texture liscia/frullata nelle settimane 1-4 (nessun pezzo).',
];

/* Segnali per fermarsi e sentire il pediatra */
const SEGNALI_ALLARME = [
	{
		grave: true,
		testo:
			'Reazione allergica: orticaria diffusa, gonfiore volto/labbra, vomito ripetuto, difficoltà respiratoria → sospendi QUEL singolo alimento e contatta il pediatra. NON ritardare gli altri allergeni.',
	},
	{
		grave: true,
		testo:
			'Pallore marcato/apatia (possibile anemia), scarso accrescimento, rifiuto persistente di tutti i solidi → senti il pediatra.',
	},
];

/* Definizione dei pasti per la UI */
const PASTI_ORDINE = [
	{ id: 'mattino', label: 'Mattino', emoji: '🌅' },
	{ id: 'pranzo', label: 'Pranzo (~12:00)', emoji: '🍽️' },
	{ id: 'pomeriggio', label: 'Pomeriggio', emoji: '🌤️' },
	{ id: 'sera', label: 'Sera', emoji: '🌙' },
];

/* Lista della spesa per settimana (derivata dal piano) */
const SPESA_SETTIMANE = [
	{
		settimana: 1,
		titolo: 'Avvio · carne · frutta',
		categorie: [
			{
				nome: 'Cereale (ferro)',
				emoji: '🌾',
				items: ['Crema di cereali FORTIFICATA con ferro (etichetta: "Ferro" ~8 mg/100g)'],
			},
			{ nome: 'Verdure', emoji: '🥕', items: ['Patate', 'Carote', 'Zucchine'] },
			{
				nome: 'Proteine',
				emoji: '🥩',
				items: ['Carne omogeneizzata: manzo/vitello (o coniglio/tacchino)'],
			},
			{ nome: 'Frutta', emoji: '🍎', items: ['Mela', 'Pera'] },
			{ nome: 'Dispensa', emoji: '🫒', items: ['Olio EVO', 'Vitamina D 400 UI (farmacia)'] },
		],
	},
	{
		settimana: 2,
		titolo: 'Uovo · pesce',
		categorie: [
			{ nome: 'Cereale (ferro)', emoji: '🌾', items: ['Crema di cereali fortificata con ferro'] },
			{ nome: 'Verdure', emoji: '🥕', items: ['Patate', 'Carote', 'Zucchine'] },
			{ nome: 'Proteine', emoji: '🥩', items: ['Carne (manzo/vitello)'] },
			{
				nome: 'Allergeni',
				emoji: '🥚',
				items: [
					'Uova fresche (da cuocere ben sode)',
					'Pesce bianco basso mercurio: merluzzo/sogliola/platessa',
				],
			},
			{ nome: 'Frutta', emoji: '🍎', items: ['Mela', 'Pera', 'Banana/altra frutta'] },
			{ nome: 'Dispensa', emoji: '🫒', items: ['Olio EVO'] },
		],
	},
	{
		settimana: 3,
		titolo: 'Glutine · legumi',
		categorie: [
			{
				nome: 'Cereale (ferro)',
				emoji: '🌾',
				items: [
					'Crema di cereali fortificata con ferro',
					'Semolino/multicereale FORTIFICATO con ferro (per il glutine)',
				],
			},
			{ nome: 'Verdure', emoji: '🥕', items: ['Patate', 'Carote', 'Zucchine'] },
			{ nome: 'Proteine', emoji: '🥩', items: ['Carne (manzo/vitello)', 'Pesce bianco'] },
			{
				nome: 'Allergeni',
				emoji: '🫘',
				items: ['Lenticchie rosse decorticate (legumi)'],
			},
			{
				nome: 'Vit. C + frutta',
				emoji: '🍊',
				items: ['Fonte di vit. C (agrumi/verdura fresca)', 'Frutta assortita'],
			},
			{ nome: 'Dispensa', emoji: '🫒', items: ['Olio EVO'] },
		],
	},
	{
		settimana: 4,
		titolo: 'Arachide · 2ª pappa',
		categorie: [
			{
				nome: 'Cereale (ferro)',
				emoji: '🌾',
				items: ['Crema di cereali fortificata con ferro'],
			},
			{ nome: 'Verdure', emoji: '🥕', items: ['Patate', 'Carote', 'Zucchine (extra per mini-pappa)'] },
			{ nome: 'Proteine', emoji: '🥩', items: ['Carne (manzo/vitello)', 'Pesce bianco'] },
			{
				nome: 'Allergeni',
				emoji: '🥜',
				items: ['Crema di arachidi 100% liscia (senza zucchero/sale)', 'Uova', 'Lenticchie rosse'],
			},
			{ nome: 'Frutta', emoji: '🍎', items: ['Frutta assortita'] },
			{ nome: 'Dispensa', emoji: '🫒', items: ['Olio EVO'] },
		],
	},
];

/* Consigli di preparazione / conservazione (meal prep) */
const PREP_TIPS = [
	'Cuoci le verdure a vapore e passale; in frigo si conservano ≤24-48h.',
	'Congela brodo e verdure passate in porzioni (cubetti); etichetta con la data.',
	'Scongela solo la porzione che serve; non ricongelare.',
	'Aggiungi l\'olio EVO a crudo, a fine cottura.',
	'L\'allergene del mattino: dose piccola e ben cotta (uovo ben sodo, pesce ben cotto, arachide crema liscia diluita).',
	'Tieni la vit. C (verdura/frutta fresca) nello stesso pasto di cereali/legumi.',
];

/* Glossario dei termini usati nell'app */
const GLOSSARIO = [
	{
		termine: 'Mantenimento',
		def: 'Continuare a proporre un allergene già introdotto, con la frequenza indicata, per conservare la tolleranza.',
	},
	{
		termine: 'Allergene',
		def: 'Alimento che può dare reazioni; si introduce da solo, al mattino, osservando 2-3 ore.',
	},
	{
		termine: 'Aumento della dose',
		def: 'La seconda volta di un allergene: se la prima prova è andata bene, si aumenta un po\' la dose.',
	},
	{
		termine: 'Cereale fortificato',
		def: 'Crema di cereali con ferro aggiunto (voce "Ferro" in etichetta): è il veicolo di ferro principale del mese.',
	},
	{
		termine: 'Ferro non-eme',
		def: 'Ferro di origine vegetale (cereali, legumi): si assorbe meglio insieme alla vitamina C.',
	},
	{
		termine: 'Pappa base',
		def: 'Crema di cereali fortificata + verdure passate + proteine + olio EVO + acqua di cottura.',
	},
];

/* Guida rapida d'emergenza (scheda SOS + banner reazione grave) */
const EMERGENZA = {
	urgente: [
		'Difficoltà a respirare, respiro rumoroso o sibilante',
		'Gonfiore di labbra, lingua o volto',
		'Bambina molto pallida, floscia o che non reagisce bene',
		'Vomito ripetuto o collasso subito dopo il pasto',
	],
	pediatra: [
		'Orticaria o ponfi diffusi sulla pelle',
		'Rossore o eruzione importante attorno alla bocca',
		'Vomito o diarrea isolati dopo il nuovo alimento',
		'Qualsiasi reazione che ti preoccupa',
	],
	regola:
		'Sospendi SUBITO solo l\'alimento sospetto. Gli altri allergeni già tollerati proseguono come da piano.',
};

/* Ricetta della pappa base (scheda a portata di tap dal pranzo) */
const PAPPA_BASE = {
	titolo: 'Pappa base (~150 g)',
	ingredienti: [
		'Crema di cereali fortificata con ferro (2 cucchiai)',
		'Verdure passate: patata + carota + zucchina (~150 g)',
		'La proteina del giorno (carne / pesce / legumi)',
		'Olio EVO 1 cucchiaino (~5 g), a crudo',
		'Acqua di cottura q.b.',
	],
	nota: 'Texture liscia e frullata, senza sale né zucchero.',
};

/* Mappa "dove trovo cosa" (onboarding + Guida) */
const DOVE_TROVO = [
	{ icona: '☀️', nome: 'Oggi', desc: 'Cosa dare adesso, pasto per pasto' },
	{ icona: '🗓️', nome: 'Calendario', desc: 'I 28 giorni a colpo d\'occhio' },
	{ icona: '📋', nome: 'Settimana', desc: 'Piano dei pasti + lista della spesa' },
	{ icona: '⚠️', nome: 'Allergeni', desc: 'Cosa è stato introdotto e le reazioni' },
	{ icona: '📖', nome: 'Guida', desc: 'Regole, ricetta e segnali d\'allarme' },
];

/* Allergeni "veri" (per il codice colore del calendario: la carne è esclusa) */
const REAL_ALLERGENS = ['Uovo', 'Pesce', 'Glutine', 'Legumi', 'Arachide'];

window.SVEZZAMENTO_DATA = {
	GIORNI,
	REGOLE_FISSE,
	ALLERGENI_RIEPILOGO,
	NOTE_OPERATIVE,
	REGOLE_ORO,
	SEGNALI_ALLARME,
	PASTI_ORDINE,
	SPESA_SETTIMANE,
	PREP_TIPS,
	GLOSSARIO,
	EMERGENZA,
	PAPPA_BASE,
	DOVE_TROVO,
	REAL_ALLERGENS,
};
