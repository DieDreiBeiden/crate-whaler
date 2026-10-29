// Drop-Tabellen Update 15.11 (Devblog "Closed Test 15.11", 29.10.2026, vorläufig)
const SANTA_GROUPS = {
  A: { label: "Schiffe Gruppe 1 (selten)", tiers: {
    10: "Lüshun|Småland|La Pampa|Álvaro de Bazán|Smolensk|Hildebrand|Thunderer|Puerto Rico|Tonijn|Monmouth|Rhode Island|Conte Verde|Fuyutsuki|Almirante Irízar",
    9: "Kronshtadt|Hizen|Musashi|Jean Bart|Benham|Błyskawica '52|Georgia|Indiana|Missouri",
    8: "Odin|Lenin|Asashio|Colossus|Anchorage|Massachusetts|Enterprise|Mikhail Kutuzov",
    7: "Z-39|Belfast|Nelson",
    6: "T-61|Admiral Graf Spee|Erich Loewenhardt",
    5: "Gremyashchy|Kamikaze R|Kamikaze|Fūjin|Giulio Cesare" } },
  B: { label: "Schiffe Gruppe 2 (mittel)", tiers: {
    9: "Dalian|Sun Yat-Sen|Velos|Victoria|Kozma Minin|Navarin|Minegumo|Suzuya|Tsurugi|Ferrante Gonzaga|Giuseppe Verdi|Marco Polo|Groningen|Z-44|Aberdeen|Scarlet Thunder|Halford|Cambridge|Tulsa|Baotou|Fort Worth|Cayuga|Triunfante|Friedrich Carl",
    8: "Narai|Orkan|Turgut Reis|Regele Carol I|Comandante Aguirre|Almirante Grau|Numancia|S-189|Provorny|Pyotr Bagration|Ochakov|Borodino|Shigure|Tone|Marcantonio Colonna|Aquila|Z-35|Wiesbaden|Schill|Hoche|Flandre|Alliance|Eskimo|Hampshire|Tiger '59|Cheshire|Indomitable|Constellation|Prince of Wales" } },
  C: { label: "Schiffe Gruppe 3 (häufig)", tiers: {
    8: "Picardie|Theseus",
    7: "Nueve de Julio|Yukon|Tashkent '39|Leningrad|Arkhangelsk|Poltava|Yūdachi|Maya|Tokachi|Hyūga|Ashitaka|FR25|Gorizia|Francesco Ferruccio|Duca degli Abruzzi|Weimar|München|Scharnhorst|Toulon|Strasbourg|Jupiter '42|Royal Sovereign|Rodney|Collingwood|Hood|Sims|Boise|Indianapolis|Atlanta|California|Florida",
    6: "Xin Zhong Guo'14|Elli|Juruá|Mysore|Admiral Makarov|Ise|Mutsu|Béarn|Orion '44|Monaghan",
    5: "Rio de Janeiro|Okhotnik|Krasny Krym|Exeter|Hill" } },
  GR: { label: "Golden: neue Schiffe", tiers: { 10: "Latouche-Tréville|Tōgasa", 0: "Rodina" } },
  GG: { label: "Golden: Gold-Versionen und Naval Legacy", tiers: { 10: "Tōgasa G|Somers G", 8: "Tywysog Cymru", 0: "Rodina G" } },
  NJ: { label: "Battle Forged", tiers: { 0: "New Jersey BF" } }
};
const B = (p, res) => ({ p, res });
const CONTAINER_DEFS = {
  ultra: { label: "Santa's Ultra Gift", pity: 7, comp: { "Stahl": 1250 }, slots: [
    [B(.05, { "Dublonen": 2500 }), B(.40, { "Kohle": 6000 }), { p: .20, give: "golden" }, B(.03, { "Premium-Tage": 180 }),
     { p: .03, ship: "A" }, { p: .09, ship: "B" }, { p: .20, ship: "C" }],
    [B(1, { "Booster episch (6×)": 1 })],
    [B(.05, { "Dublonen": 2500 }), B(.81, { "Elite-Kommandanten-EP": 37500 }), B(.14, { "Kohle": 6000 })]
  ] },
  mega: { label: "Santa's Mega Gift", pity: 15, comp: { "Stahl": 1250 }, slots: [
    [B(.05, { "Dublonen": 2500 }), B(.08, { "Kohle": 12500 }), { p: .10, give: "golden" }, B(.01, { "Premium-Tage": 180 }),
     B(.10, { "Elite-Kommandanten-EP": 100000 }), B(.10, { "Credits": 2250000 }), B(.32, { "Booster selten (20×)": 1 }), B(.08, { "Booster episch (7×)": 1 }),
     { p: .01, ship: "A" }, { p: .03, ship: "B" }, { p: .12, ship: "C" }]
  ] },
  santa: { label: "Santa's Gift", pity: 100, comp: { "Stahl": 250 }, slots: [
    [B(.05, { "Dublonen": 500 }), { p: .01, give: "golden" }, B(.07, { "Kohle": 2500 }), B(.01, { "Premium-Tage": 30 }),
     B(.10, { "Elite-Kommandanten-EP": 20000 }), B(.10, { "Credits": 400000 }), B(.055, { "Hafenplätze": 1 }),
     B(.10, { "Booster selten (3×)": 1 }), B(.24, { "Booster ungewöhnlich (12×)": 1 }), B(.24, { "Signale (25×)": 1 }),
     { p: .001, ship: "A" }, { p: .004, ship: "B" }, { p: .02, ship: "C" }]
  ] },
  golden: { label: "Golden Gift", pity: 10, golden: true, slots: [
    [B(.60, { "Booster episch (7×)": 1 }), B(.20, { "Forschungspunkte": 3750 }), B(.10, { "Stahl": 3000 }),
     { p: .09999, ship: "GR" }, { p: .00001, ship: "GG" }]
  ] },
  bf: { label: "Battle Forged Premium", pity: 3, comp: { "Stahl": 2500 }, slots: [
    [B(1, { "Booster legendär (3×)": 1 })],
    [B(.25, { "Forschungspunkte": 10000 }), B(.25, { "Stahl": 5000 }), { p: .50, ship: "NJ" }],
    [B(1, { "Booster legendär (3×)": 1 })]
  ] }
};
