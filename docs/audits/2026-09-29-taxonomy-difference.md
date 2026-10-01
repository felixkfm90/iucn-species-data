# Lesende Prüfung der Masterdifferenz nach dem Grundlagenlauf

Prüfabschluss: 29. September 2026. Historische Aufnahme des am 28. September aktivierten Paars.
Diese Prüfung erklärt die Bestandsdifferenz, sie ist **keine Fehlerbehebung und kein Phase-10-Audit**.
Die Start-/Abschlussaufnahme vom Vortag bleibt unverändert:
[Grundlagenlauf](2026-09-28-taxonomy-baseline-run.md).

## Ergebnis und Betriebsgrenze

Die Differenz ist vollständig rechnerisch aufgeschlüsselt, aber fachlich nicht freigabefähig:
**150 Arten werden durch verlorene Aufnahme-Merkmale ausgeschlossen; vier weitere erhalten wegen eines
geleerten Reichs neue IDs.** 44 weitere Einträge kommen erstmals in diesen Masterbestand.
Das ist keine belegte taxonomische Aufteilung/Zusammenführung und keine bestätigte Anbieter-Löschung.

Bis zur Korrektur und kontrollierten Wiederherstellung keinen weiteren produktiven Taxonomieaufbau,
keine Speicherbereinigung und keinen katalogweiten FN-Abgleich zur Reparatur dieses Befunds starten.
Das erhaltene Vorgängerpaar und die alten Anbieterstände werden für Vergleich und Reparatur benötigt.
Keine Empfehlung, vorhandene Fotos oder Projektarten neu anzulegen oder manuell umzuhängen.

## Umfang und Methode

- Altmaster: `master-20260905054823067`; aktueller Master: `master-20260928064750796`.
- Altes Suchpaket: `lightroom-946c961bd063fd1b8f12`; aktuelles Suchpaket: `lightroom-3953cad48c24e581d041`.
- Aktive CoL-Referenz in beiden Herkunftsangaben: `col-xr-2026-08-26-316165`.
- Vollständiger ID-Mengenvergleich beider Master, anschließend gezielte Quellenprüfung für alle 154 fehlenden IDs.
- Identitätsvergleich aller Datensätze beider Suchpakete gegen ihren jeweiligen Master:
  ID, wissenschaftlicher Name, Rang und Reich stimmen jeweils überein; weder fehlende noch zusätzliche Paket-IDs.
- Die iNaturalist-Dateien `snapshot-20260903164505354/records.json` und
  `snapshot-20260927072533099/records.json` wurden unter dem lokalen
  `taxonomy/master/providers/inaturalist/releases/` gelesen. Alle 154 betroffenen Anbieter-IDs sind auch
  in der neueren Datei vorhanden und nicht als entfernt markiert.
- Für die 150 vollständig ausgeschlossenen Arten wurden ihre alten CoL-Quell-IDs gegen die lokale aktive
  Vollreferenz geprüft: alle vorhanden, 148 mit Status `accepted`, zwei `provisionally accepted`.
- Produktionsdatenbanken ausschließlich mit `DatabaseSync(..., { readOnly: true })` und zusätzlichem
  `PRAGMA query_only=ON` geöffnet. Gemeinsamer Veröffentlichungszeiger unverändert; Dateigröße und
  Änderungszeit beider Master vor/nach den Abfragen identisch. Kein unabhängiger erneuter Vollhash und
  keine erneute vollständige Integritäts-/Feldprüfung.
- Der lokale Explorer-Dienst war bei der Diagnose nicht erreichbar. Er wurde nicht gestartet.
  Keine Anbieteranfragen, keine Lightroom-Katalogabfrage, kein produktiver Aufbau/Wechsel/Rollback.
- Eine isolierte Drei-Datensatz-Gegenprobe benutzte nur einen eigens erstellten Testordner und
  `writeProviderSlice` plus den echten Master-Auswahlfilter. Die beobachteten Fehler wurden reproduziert;
  die Testdaten wurden danach entfernt. Das ist ein Fehlernachweis, kein bestandener Reparaturtest.

## Mengenvergleich

| Vergleich | Taxa |
| --- | ---: |
| Alter Master | 273.418 |
| Gleiche ID in beiden Ständen | 273.264 |
| Alte IDs fehlen | 154 |
| Neue IDs | 48 |
| Neuer Master | 273.312 |

`273.418 − 154 + 48 = 273.312`, netto minus 106.
Unter den 48 neuen IDs sind vier Ersatz-IDs für die vier unten genannten gleichen Anbieter-Taxa.
Damit verbleiben 44 zusätzliche Einträge gegenüber dem Altmaster: 43 neue wissenschaftliche Namen und
ein zusätzlicher, von GBIF unter Plantae geführter Namensgleichheitsfall `Chloris chloris`.
Der bekannte Grünfink-Eintrag unter Animalia bleibt mit seiner alten ID erhalten. Diese beiden
Anbieteridentitäten dürfen nicht allein aufgrund des gleichen Namens zusammengeführt werden;
eine unabhängige fachliche Prüfung des GBIF-Pflanzeneintrags war nicht Bestandteil dieser Diagnose.
Für die 273.264 gemeinsamen IDs wurden keine Änderungen von kanonischem wissenschaftlichem Namen,
Rang, Reich, Referenzzustand oder Lebenszykluszustand gefunden. Das ist kein Vollvergleich aller Namen,
Hierarchien, Suchbegriffe und Feldbelege.

## Befund 1: Teil-Suchergebnisse verdrängen die Aufnahmegrundlage

Für alle 150 ausgeschlossenen Arten ist im älteren iNaturalist-Ausschnitt `selectedForMaster: true`
vorhanden. Im neueren Ausschnitt steht `selectedForMaster: false`, als einziger Relevanzgrund
`searched-taxon`. Hierarchien und umfangreichere Namenslisten können dabei ebenfalls durch
schmalere Treffer ersetzt werden. Beispiel Schwarzstorch (`Ciconia nigra`, iNaturalist-ID `4736)):
vorher ausgewählter breiter Datensatz mit Hierarchie und `missing-name`; später Suchtreffer unter
anderem für `storch` beziehungsweise `ciconia c…`, ohne Auswahlmarker und ohne Hierarchie.

Nachweisbarer Codepfad:

1. `normalizedProviderRecord` / `mergeProviderRecord` im
   [Ergänzungsdienst](../../species-explorer/taxonomy-supplement-service.mjs) erzeugen/vereinigen Suchtreffer
   im Ergänzungscache. Dieser ist nicht identisch mit dem gesamten breiten Anbieter-Ausschnitt.
2. [writeProviderSlice](../../species-explorer/taxonomy-master-slices.mjs) ersetzt bei **derselben**
   Anbieter-ID die bisherige Zeile durch die eingehende normalisierte Zeile. `preserveUnmentioned: true`
   schützt nur nicht erwähnte IDs; bei erwähnten IDs werden Auswahlmarker, Relevanz und belegte Felder
   nicht mit der vorherigen breiten Zeile vereinigt.
3. `activeMasterProviderSlices` im
   [Masterservice](../../species-explorer/taxonomy-master-service.mjs) schließt reine
   `searched-taxon`-Treffer ohne Auswahlmarker aus. Dadurch fehlt auch der Name in der Zielmenge,
   aus der die CoL-Belege für den Master gelesen werden.
4. Der Kandidat enthält diese Arten nicht, obwohl sie in der Vollreferenz und in der lokalen
   Anbieterdatei weiter vorhanden sind. Das Lightroom-Paket übernimmt genau diesen reduzierten Master.

Der echte Auswahlfilter wurde auf alle betroffenen alten/neuen Eingangszeilen angewandt:
**154 vorher ausgewählt, vier nachher ausgewählt, 150 ausgeschlossen.** Die vier verbleibenden
Zeilen gehören zu Befund 2. In der separaten Drei-Zeilen-Gegenprobe blieb eine nicht erwähnte Art
korrekt erhalten, die erwähnte Art verlor dagegen ihre Zulassung trotz `preserveUnmentioned`.
Damit ist die Grenze zwischen „erwähnt, aber unvollständig“ und „nicht erwähnt“ reproduziert.

Das Merkmal `selectedForMaster` ist hier ein technisches Aufnahme-Merkmal des breiten Imports,
nicht der Nachweis, dass Felix jede dieser Arten manuell einem Foto zugewiesen hat.

## Befund 2: Fehlendes Reich erzeugt neue Master-IDs

Bei vier weiter aufgenommenen iNaturalist-IDs sind wissenschaftlicher Name und Rang unverändert,
aber das vorher belegte Reich ist in den späteren Suchtreffern leer.
[createStableMasterTaxonId](../../species-explorer/taxonomy-master-model.mjs) berechnet die Kennung
aus Name, Rang **und Reich**. Die Funktion reproduziert für alle vier Fälle sowohl die alte als auch
die neue tatsächlich gespeicherte ID.

Der [Kandidatenbau](../../species-explorer/taxonomy-master-candidate.mjs) kann die alte Art als
`previousTaxon` für die Feldübernahme erkennen, verwendet für die neue Kennung ohne ausdrückliche
Identitätsentscheidung jedoch die neu berechneten Werte. Ein fehlendes Reich ist damit kein harmloses
leeres Zusatzfeld. Das aktive Identitätsregister hat keine Ereignisse; es gibt hier keine bestätigte
Nachfolgerentscheidung. Eine automatische Namensheuristik ist ausdrücklich **keine** Reparatur.

| Wissenschaftlicher Name | iNaturalist-ID | Reich | Alte Master-ID | Neue Master-ID |
| --- | --- | --- | --- | --- |
| Gaeolaelaps ciconia | 1454825 | Animalia → leer | `mtx_19719444c1666bea5088d5ce946ba4ef` | `mtx_3fc84d77c9942dc61693e6cfefb25bdb` |
| Pseudogabucinia ciconiae | 1049831 | Animalia → leer | `mtx_7e5d33c57bc5a76527ba96bdaf178cf0` | `mtx_d41d127f308fffc6b929fb99ee2a80e8` |
| Aethalodelphis obliquidens | 1664971 | Animalia → leer | `mtx_8c5fd7d13457ac57d96a828ab3fa6d69` | `mtx_e984360f840432d0462edb6378c673f7` |
| Hawksworthiomyces ciconiae | 1560398 | Fungi → leer | `mtx_b88808dedd8101006b6b1ece9da7d08a` | `mtx_4f004040870dc8405d2d4fc391f3822b` |

## Projektarten, eigene Namen und Lightroom

- Alle 56 alten Projektverknüpfungen behalten ID und Zustand `linked`.
- Vier später angelegte Projektarten sind hinzugekommen: `Agalychnis callidryas`, `Chloris chloris`,
  `Oophaga pumilio`, `Perdix perdix`.
- Alle 60 Einträge der gelesenen `species_list.json` besitzen genau eine passende Masterverknüpfung.
- Keine dieser Projektarten gehört zu den 154 fehlenden alten IDs.
- Alle fünf eigenen Namenskorrekturen sind unter derselben Master-ID im aktuellen Master ausgewählt und
  im aktuellen Lightroom-Paket vorhanden: Rotstirnamazone, Taubenschwänzchen, Leopard, Weissstorch, Rebhuhn.
  Die drei ausdrücklich gesetzten englischen Korrekturen stimmen im Master ebenfalls.
- Der alte Basispaket-Eintrag für `Perdix perdix` heißt noch Feldhuhn; das alte Veröffentlichungspaar
  referenziert zusätzlich ein Namenskorrektur-Release. Dieser rohe Basiseintrag ist **kein** neuer
  Rückfall der aktuellen Namenswahl.
- Die 154 fehlenden alten IDs fehlen entsprechend auch im aktuellen Suchpaket. **Kein separater
  Lightroom-Exportverlust:** Beide Pakete entsprechen vollständig ihrem jeweiligen Master.
- Ob diese Arten außerhalb der angelegten Projektarten schon Lightroom-Fotos zugewiesen wurden, ist
  nicht geprüft. Vorhandene Foto-Metadaten wurden nicht gelesen oder verändert. Eine mögliche spätere
  Nichtauflösbarkeit alter Foto-IDs bleibt deshalb ein zu berücksichtigendes Risiko.

## Reparaturauftrag vor weiterer produktiver Abnahme

1. Den Zusammenführungsvertrag für **Teil-Suchtreffer** korrigieren: bekannte Aufnahmegrundlage,
   belegte Identitätsfelder und Herkunft nicht still durch fehlende Werte ersetzen. Echte Rücknahmen,
   ausdrücklich neue fachliche Angaben und unvereinbare Reichsangaben getrennt behandeln.
2. Identität bei identischer Anbieter-ID erhalten beziehungsweise ausdrücklich prüfen. Fehlende
   Klassifikation darf nicht still eine neue Art erzeugen; auch Homonyme und echte Identitätsereignisse
   müssen abgedeckt sein. Keine Zuordnung allein nach ähnlichem Namen.
3. Die bereits betroffenen lokalen Eingänge kontrolliert aus belegten Vorgängerinformationen
   reparieren; ein reiner Codefix stellt den bereits verminderten Auswahlstand nicht von selbst wieder her.
   Vorschau und Nachweis für alle 150 ausgeschlossenen Arten und vier ID-Fälle vor produktivem Schreiben.
4. Vor gemeinsamer Aktivierung unerklärte ID-/Bestandsverluste sichtbar machen und absichern.
   „Keine blockierenden Konflikte“ war hier kein Nachweis, dass keine Arten verloren gingen.
5. Kleine Regressionen und anschließend nur lesende echte Eingangsgegenprobe zuerst; erst danach einen
   ausdrücklich abgestimmten produktiven Reparaturlauf. Eigene Namen, 60 Projektlinks und ursprüngliche
   vier IDs nachweisen. Keine erneute lange Schleife nur zur Ursachenfindung starten.

Die Ursache ist diagnostiziert, **noch keiner dieser Reparaturschritte ist umgesetzt**.
Das nächste Arbeitspaket ist diese Korrektur, nicht das Gesamtaudit oder eine weitere Laufzeitmessung.
Maßgeblicher Restplan: [Roadmap](../roadmap.md).

## Anhang A: vollständig ausgeschlossene Arten

Für jede Zeile gilt: Anbieter-ID im alten und neuen iNaturalist-Ausschnitt vorhanden;
vorher `selectedForMaster=true`, nachher `false` und ausschließlich `searched-taxon`.
Die angegebene CoL-Quell-ID wurde in der aktiven Vollreferenz gefunden.

| Wissenschaftlicher Name | Alte Master-ID | iNaturalist-ID | CoL-Quell-ID |
| --- | --- | --- | --- |
| Abies alba | `mtx_8de80b2888cbbc0ee5d6568b009011ac` | 136319 | 8K9Y |
| Acer campestre | `mtx_f2098fe05abfbd2556a5a47c6948a65a` | 56193 | 946Z |
| Acer platanoides | `mtx_b6b5d83d29865ec34d09f887de3d6088` | 54763 | 94H3 |
| Acer rubrum | `mtx_7e284821a4f38d8d2d459b4c7510c70a` | 48098 | 94JD |
| Achillea millefolium | `mtx_f40bd92027a15b6e247c577fbd523da1` | 52821 | 97H4 |
| Acleris variegana | `mtx_fbad56cab7fec4f8fdeda494739a0228` | 212354 | 9D2Z |
| Agapanthia cardui | `mtx_12d3a6d7794aede0958087372576ecea` | 326397 | 65L9M |
| Agaricus campestris | `mtx_68d63656738dee2286f9acee00f9fb1b` | 143563 | 65NKD |
| Ageratina altissima | `mtx_fef5f34112812d4728c6ffe0bedee578` | 119048 | B3GPN |
| Agriphila selasella | `mtx_8ebb39b0a5be3d23bd5326f400cdb78c` | 325501 | B7XP |
| Alauda arvensis | `mtx_3083cc84d82246c0a379d8a01bca1287` | 7347 | BFFT |
| Amazona albifrons | `mtx_b8b4fd8f38eb810aee2b7111dcb12ea1` | 18995 | 5TZRX |
| Amblyospiza albifrons | `mtx_329e00766109734e551fae2b3071b005` | 14064 | CMSP |
| Ammospermophilus leucurus | `mtx_061074382592e46794548104202a756e` | 46255 | CVGP |
| Antilope cervicapra | `mtx_84d8652fe10c3353e989913b761676e8` | 42416 | 67LD3 |
| Asthenes flammulata | `mtx_d0358fe2b06763d839411dd2d6e65446` | 11347 | 5VW8K |
| Austronomus australis | `mtx_9538281b93900cc53aee94ff2b12483f` | 765537 | 8Q857 |
| Bidens alba | `mtx_d4ae3c5444e044f7ce9966df76ee2fe9` | 1095846 | LS2R |
| Boscia albitrunca | `mtx_5ea4845dee5bbe280b924e909dcf341c` | 70065 | MLRF |
| Cabera exanthemata | `mtx_36c0689fb6129c2c22d12e4165d64a57` | 130099 | 5X5JK |
| Cabera pusaria | `mtx_1c0f3cba1191326317abfd411652b89e` | 130101 | P44R |
| Catharanthus roseus | `mtx_5f2df13ade1bd21544cfcd9d99029408` | 62924 | RTT8 |
| Cervus elaphus | `mtx_ee1e31cb236a03f0fdc8fec47bb42dd6` | 204113 | T56G |
| Chamaenerion angustifolium | `mtx_521c30893de7970c1c8a94625b8e0b6e` | 564969 | 7NFK8 |
| Chenopodium album | `mtx_14a32425952cff817891a5c46bd03308` | 58127 | TX8H |
| Cichorium intybus | `mtx_bac5c51d5733e2a826fbc3f393a24abf` | 52913 | V857 |
| Ciconia abdimii | `mtx_bd9c43014e7ffa66f6dcd57d95f90410` | 4732 | 5YTT3 |
| Ciconia boyciana | `mtx_a0122e5144afbd99a85d56b27bb2f3e0` | 4739 | 5Z5SR |
| Ciconia episcopus | `mtx_13262d777a335b082d3f6fc2645fd7c8` | 4738 | 5Z64R |
| Ciconia maguari | `mtx_719c0d87df872206cfab76e2ffae1cbf` | 4740 | 5Z653 |
| Ciconia microscelis | `mtx_ac0e98f7e778d4d38c646138640d9bdf` | 1429237 | DDF2C |
| Ciconia nigra | `mtx_1b4b75f12b8df092f5da490bf42ec388` | 4736 | 5YTSK |
| Ciconia stormi | `mtx_b5e35c9e36e27a01155d9d3d8b52b612` | 4737 | 5Z5SK |
| Cocos nucifera | `mtx_6bd71f840dd2e0e6232e5a11b1b40243` | 48865 | WP6H |
| Conirostrum cinereum | `mtx_b7c6d86e37c14e6b35751fbb4a42fd1d` | 10012 | XP4C |
| Conium maculatum | `mtx_a0019da023cfffd382d61ae7bd75352f` | 52998 | XP6T |
| Cornu aspersum | `mtx_a1ed698d96bd617ae470f9f7d44ef3ea` | 480298 | YG75 |
| Crataegus monogyna | `mtx_9a5ba7f1e8cce8abb87842ad97abe7e4` | 51147 | 6BB5X |
| Crotalus adamanteus | `mtx_7150200c07370c1b979cc079feee834e` | 53491 | 6BJ5V |
| Crotalus atrox | `mtx_59441c6d100f99a6ff5ed249bc97180b` | 30764 | 6BJ5K |
| Crotalus cerastes | `mtx_01c91359ad200e2851ce7c309745a599` | 30751 | ZPB7 |
| Crotalus horridus | `mtx_909fb4bce330f3df0847c19c7abc23a9` | 30746 | ZPBS |
| Crotalus molossus | `mtx_aa22ecca2a4f5b1bd08ac90b10e48b64` | 515948 | 6BJ5B |
| Crotalus oreganus | `mtx_0c9e7e9e5a14b0fa8372f384e371f618` | 48268 | ZPCJ |
| Crotalus pyrrhus | `mtx_d724f250d048d96579c2e2d405dbff24` | 539508 | 6BJ5D |
| Crotalus ruber | `mtx_23fe10066680abca859952755b6c58d3` | 30724 | ZPCX |
| Crotalus scutulatus | `mtx_feb3f2b20491c55ecaa8df8f986c527c` | 30719 | ZPD2 |
| Crotalus viridis | `mtx_1157b6b80bb9a98141e6c1108fe09bec` | 81526 | ZPDQ |
| Curruca curruca | `mtx_d1fe881a9cca46da67ee0fd12fa09c47` | 1289484 | DDBMF |
| Dorcopsis hageni | `mtx_50d04839bacb0969ca037ea43beb7ddf` | 42940 | 37CQJ |
| Elanus leucurus | `mtx_9fec7aadcd1c4a78648cba5425461d57` | 5277 | 38YJ8 |
| Epipactis helleborine | `mtx_3a67794410ba379f056fdc8d9322717e` | 50717 | 6FVKS |
| Erebia ligea | `mtx_e49a7aeeb37623ece8cb7d5f16f0ad31` | 62381 | 6GDFM |
| Erigeron annuus | `mtx_7cbc1b557774d3ce927c57efe6be314c` | 76897 | 6GNJG |
| Erodium cicutarium | `mtx_7fe7cc97ec7f634ddf65e92395b810bb` | 47687 | 3B8Z3 |
| Eryngium campestre | `mtx_c411d6eba992b3c9f1101746f1ed484b` | 162699 | 6H4BC |
| Eudocimus albus | `mtx_e5c1f1ce60a1de01bb2ac5236f79823b` | 3751 | 3C2DJ |
| Eupeodes corollae | `mtx_afb4218bbdc4a2dddd6f7cfde97b1574` | 69190 | 3CLTN |
| Gaillardia pulchella | `mtx_21958f48ccd2c8380fb12c92fa2acd12` | 51768 | 6K7NT |
| Geranium columbinum | `mtx_101a678e37011f8f1198058fc7cc63d2` | 77253 | 6KCB2 |
| Geranium dissectum | `mtx_0e5d17651023ac9e5fae650db19f7c67` | 53075 | 6KCC8 |
| Geranium lucidum | `mtx_03a4c2ca4c3ad3f00c08f0ee5188c397` | 77255 | 6KDTW |
| Geranium macrorrhizum | `mtx_9effd8f58ed9142139b15f5db79ee0e8` | 320685 | 6KDTM |
| Geranium molle | `mtx_72051896204c07d665f353285e3b569d` | 53076 | 6KDH8 |
| Geranium nodosum | `mtx_42eef4c46c05a73bbeac86e41fb0d9a6` | 60362 | 6KDGZ |
| Geranium palustre | `mtx_b98a433e020b8e51739e077abd56c1bd` | 57644 | 6KDL7 |
| Geranium phaeum | `mtx_e773eef7e68f1620a8debfab137fdfd6` | 55756 | 6KDLT |
| Geranium pratense | `mtx_76001582ff89ea74ce5ba32e273e2aad` | 55722 | 3FV2S |
| Geranium purpureum | `mtx_c30835883cd977a17af56e99a1c7355b` | 57643 | 3FV3P |
| Geranium pusillum | `mtx_9ba0abe70c88b2d0d91eb76a5f9b17c4` | 60204 | 3FV3T |
| Geranium pyrenaicum | `mtx_6b1e70e18f03e768e5fd8846f76bf54a` | 77259 | 3FV3V |
| Geranium robertianum | `mtx_7cb9d45969954e681b125f33f6e8c46e` | 55925 | 3FV57 |
| Geranium rotundifolium | `mtx_511e0a5849636aeabbef9c3173502577` | 77261 | 3FV5F |
| Geranium sanguineum | `mtx_432715e8b4d29ecf0c78513133cd1db9` | 129853 | 3FV5W |
| Geranium sibiricum | `mtx_327c48554f17ccfe5bd12bb42d05799c` | 163265 | 3FV6Y |
| Geranium sylvaticum | `mtx_9f07a2719ca673a0bd6fa8564b3c2e7b` | 85429 | 3FV8Q |
| Geranoaetus albicaudatus | `mtx_a0b019e790840c4c1a1666a1476f526c` | 201043 | CV6N8 |
| Grifola frondosa | `mtx_6497a5e83e54ccb880b57eebd2d71dd5` | 53714 | 3HDV8 |
| Gryllus campestris | `mtx_b58da05770c7fefe0d8c444b84acab44` | 71248 | 8PMMM |
| Haliaeetus leucocephalus | `mtx_4cc141f8eac80c71f6715db2fa5832bb` | 5305 | 3JBJW |
| Ixodes scapularis | `mtx_c0b66a61d5b733422b4f3be93b1604dc` | 60598 | 3QGM5 |
| Lachnellula subtilissima | `mtx_b0707b00eb370b1e6b4dfcf0d1947f25` | 351330 | 3RPM2 |
| Lalage nigra | `mtx_7a066bd08ff23589bca22c6933896b39` | 8382 | 6NTZH |
| Larentia clavaria | `mtx_949f164cd1f09036eb6e4e0c71eb0ffb` | 434512 | 6NXXR |
| Lepidocolaptes leucogaster | `mtx_2cceba2886c89b325f554d30b44011fe` | 11586 | 3TB95 |
| Lepus europaeus | `mtx_ac35c6ef2ff559ff74b75b6de86bcefd` | 43128 | 6PPYF |
| Lipoptena cervi | `mtx_c91aca9ffb95965365f00d0ad867525e` | 130393 | 3VB49 |
| Lomographa bimaculata | `mtx_f13fbb1aee4fd4633e0768a492c7f397` | 460209 | 3VXCZ |
| Lomographa temerata | `mtx_51e7c835d390690afabe07c6411b0808` | 319745 | VJ7JT |
| Lucanus cervus | `mtx_ed61bc35a124cfde76f77eb9146c11f6` | 61749 | 72P4Y |
| Magnolia grandiflora | `mtx_06f74301141b1e669bf74796ce57f77c` | 83074 | 3XHB5 |
| Manorina melanocephala | `mtx_61fdcf50cf7223e73ce5085b29629756` | 12231 | 736KF |
| Marasmius oreades | `mtx_2f1d00bff998a41ea2f31bc7e6efe463` | 118240 | 3XZRT |
| Melilotus albus | `mtx_b1e7551407ad76f24c2c81435b27331a` | 58907 | 3ZFBQ |
| Melolontha melolontha | `mtx_1ce8ff569753e9f0bc4543441211f923` | 48197 | 3ZMMR |
| Melopoeus albostriatus | `mtx_ff90454c0e09e5072f0f0e82f0baa0a7` | 1676737 | VPXXB |
| Merops bullockoides | `mtx_54fe117fe72e3af521348ff6e9bdf6e4` | 2248 | 3ZW58 |
| Mindarus abietinus | `mtx_4f3b46f4e0cec986f7038f7cc1776cb7` | 454525 | QWJTS |
| Misumena vatia | `mtx_a8d4527b6d89d0dbd68b79046d3aba5d` | 55746 | 43P3V |
| Mitchella repens | `mtx_82e3666b8894400a428e29c17587dd6a` | 83799 | 43P8Q |
| Myiodynastes luteiventris | `mtx_b27b4b2dad943c85e9b26e023c09fd62` | 16071 | 452TH |
| Myrmotherula cherriei | `mtx_844a798458be66628cc3cd0614d4df88` | 15826 | 45CZ5 |
| Notharchus hyperrhynchus | `mtx_173b00913353aae12355bd9e4350b175` | 73106 | 7W39G |
| Odocoileus virginianus | `mtx_8d43503553b9877617fffcf8b491a7c2` | 42223 | 48NBQ |
| Otala lactea | `mtx_baa874c2bafae85ee7d0bf19f2aafeeb` | 202861 | 4B22B |
| Parablennius zvonimiri | `mtx_df9d7558a926acbfd5aa0c70e9ab912e` | 108412 | 4CMJP |
| Parthenocissus quinquefolia | `mtx_6d20e1bb8f965c87cb392c9a32df1143` | 50278 | 4DTTQ |
| Parupeneus crassilabris | `mtx_d1d9e960daf3a57caef84d28188b1272` | 188052 | 764SW |
| Passer montanus | `mtx_df5a819f1ecc1d4feb3558ba34e3b8d2` | 13851 | 4DXY4 |
| Patagioenas leucocephala | `mtx_97a1fb0330de402c19f943591703b9e6` | 3093 | 4DZDX |
| Pelargopsis capensis | `mtx_d71ae37704ccdfb85b6cb52e49e0e51b` | 2366 | 6TZF6 |
| Penelope superciliaris | `mtx_ef9e65a8f9ef00d07221ed31bd20160b` | 2061 | 76GSK |
| Peromyscus maniculatus | `mtx_16faf8dd4447fbfc6fceb431d113cda4` | 44396 | 4F7KP |
| Pholidichthys leucotaenia | `mtx_8f113272e15989cdc85a99fd77d31e34` | 424143 | 4GLQG |
| Phyllomedusa vaillantii | `mtx_52c4409df229ad2f3d671ebede2c5e68` | 23728 | 4H7SN |
| Phylloscopus collybita | `mtx_4365b766cc3ccdb16ef1f68a29aed75d` | 117016 | 6VFMH |
| Pieris napi | `mtx_e3ccc0eb9bb1ad2016585bd57f7fe6c1` | 54087 | 4HRQQ |
| Pinnoctopus ornatus | `mtx_7465e3bc2176a3d248818a46e51edf92` | 1678342 | KTV7W |
| Pinus albicaulis | `mtx_8de8bf8c6c685ec76dd22c5fa3a78cea` | 68083 | 4J224 |
| Pinus sylvestris | `mtx_54049e0aeb19c1b575e801c374e0a41a` | 58722 | 4J2J5 |
| Polistes dominula | `mtx_e984c408da4220a90e8faf7ef85b55e4` | 84640 | 6W4Q4 |
| Polystichum acrostichoides | `mtx_ce624a8ca72e4b5ff2c9a069ee14187b` | 54412 | 4LMKM |
| Psathyrella piluliformis | `mtx_3287b8a8f2bf9e4931f301d9d5434673` | 118273 | 6WBK8 |
| Quercus alba | `mtx_feb6ad9b4f11198a33b616eb54f0d20a` | 54779 | 4R47Z |
| Rallus crepitans | `mtx_69b444986b1000c9c91cfc7d841dc905` | 367477 | CPG8P |
| Rhaphigaster nebulosa | `mtx_de80dc3d3796bfc76f2add7bbd22e836` | 142936 | SCYFT |
| Rhinanthus alectorolophus | `mtx_410f84aa456e4253812fcf0f2704e014` | 130718 | 4S78C |
| Rhinanthus minor | `mtx_a8265cec14a5dd14666a45eee6c16ce3` | 61470 | 795LB |
| Rhinanthus serotinus | `mtx_bb42cc058edda0252559742209131e1e` | 167803 | 4S7BP |
| Rhipidura aureola | `mtx_3c7102d36446f0d286dd800de6c837e3` | 8126 | 4SB9S |
| Robinia pseudoacacia | `mtx_0d0601bf68c82f610ceec26bb124c135` | 56088 | 4T7YV |
| Rosa multiflora | `mtx_77bfac0401f0d175577c0abb60444668` | 78882 | 4TDNJ |
| Sayornis phoebe | `mtx_ffa776be1645344f83545553e8d25be5` | 17008 | 79SRD |
| Silene latifolia | `mtx_90520b01aa0dc3307384622f26bc6ec5` | 79109 | 4XCGC |
| Sistrurus catenatus | `mtx_1dc588b10ab396c651cc5d3fb8ff593f` | 520469 | 4XRRX |
| Sitta carolinensis | `mtx_7fbcf5740e18fe48dc00daf05f665337` | 14801 | 6Z4QZ |
| Sonchus oleraceus | `mtx_91e97bd587dcd2a1f9f8f67066586220` | 53294 | 4Y9CR |
| Spizella pusilla | `mtx_8661c3257437fd52498ad92a6c1b827d` | 9152 | 6ZCJC |
| Torilis arvensis | `mtx_1ac21f4b09cdfc1d6c474e23680dcfcf` | 56846 | 57FNY |
| Triaenodon obesus | `mtx_e59d9c45101bb33ede6626c5226f4b93` | 52314 | 5855Q |
| Trifolium campestre | `mtx_0a3584b5805de768a364125c22042a6c` | 57076 | 7CSFT |
| Trifolium repens | `mtx_aecf21f79c2439fff4dfb5e89e309a52` | 55745 | 58Q4Y |
| Tsuga canadensis | `mtx_4c7e8c9d8a4f8d8586e82845ddc79435` | 48734 | 59HM6 |
| Tyta luctuosa | `mtx_c657c844729fd5cb987af06ee0700cba` | 335065 | 93RN2 |
| Ulmus minor | `mtx_cedbd5b806b49ac7d3d95e1ffd447006` | 79461 | 7DFNR |
| Veronica arvensis | `mtx_2fba41b472d1f0cf3e7dcac8aacda938` | 55748 | 5B6FX |
| Vinca minor | `mtx_bed51ffc6b90f06aa5ce9a506f6ee98a` | 55844 | 5BFGJ |
| Zenaida asiatica | `mtx_df2f93383b25dcd213de35e4413f87b3` | 3460 | 7GDXZ |
| Zimmerius vilissimus | `mtx_5b3aaa0cdfed5500ead4d1151ec8b52b` | 16255 | 5D598 |
| Zonotrichia albicollis | `mtx_d3d76348b1100dbd2a731c010bebe122` | 9184 | 5D75Z |

## Anhang B: neue IDs gegenüber dem Altmaster

Dies ist eine Herkunfts-/Mengenliste, keine unabhängige taxonomische Neubewertung jeder Art.
Vier Zeilen sind die oben belegten ID-Wechsel; 44 sind zusätzliche Einträge in diesem Masterbestand
(43 neue Namen und der getrennte Plantae-Eintrag zu `Chloris chloris`).

| Wissenschaftlicher Name | Neue Master-ID | Einordnung | Gespeicherte Anbieterbelege |
| --- | --- | --- | --- |
| Acanthiophilus ciconia | `mtx_4e3a51ec17fa66c809949f680740e3f0` | Zusätzlich im Master | catalogue-of-life, inaturalist |
| Adelges nordmannianae | `mtx_0c30ce3e2ef03a4c394d437b591d5472` | Zusätzlich im Master | inaturalist |
| Aenictus weissi | `mtx_7b2eba1daa8c1fc0111c60c1b815abb3` | Zusätzlich im Master | catalogue-of-life, gbif |
| Aethalodelphis obliquidens | `mtx_e984360f840432d0462edb6378c673f7` | ID-Wechsel, siehe oben | inaturalist |
| Alopecosa accentuata | `mtx_30284cf95fb67f636c6c4a53e9791608` | Zusätzlich im Master | worms |
| Amphichroum feldmanni | `mtx_a05685e77db2da9d7ecefbcf206293bb` | Zusätzlich im Master | catalogue-of-life, gbif |
| Anarhynchus marginatus | `mtx_f5ff61857d485b756db1058cc4474b56` | Zusätzlich im Master | inaturalist |
| Andrena ciconia | `mtx_4c958d02c818a979d8362eb63a18d599` | Zusätzlich im Master | catalogue-of-life, inaturalist |
| Apocephalus weissi | `mtx_14078cdf4f0958d6d07635c6ccece345` | Zusätzlich im Master | catalogue-of-life, gbif |
| Ardeicola ciconiae | `mtx_777583fd4bef7985ea7238d0bb8f9b4f` | Zusätzlich im Master | catalogue-of-life, inaturalist |
| Asplenium germanicum | `mtx_c5dc044aeb3b4a5ee12b0b0419825c2a` | Zusätzlich im Master | gbif |
| Basidiodendron trachysporum | `mtx_1abc8349fd9df89ecfb56feb4ae60f34` | Zusätzlich im Master | catalogue-of-life, gbif |
| Chloris chloris | `mtx_b30849325ed08bdc51f13932af3688cf` | Zusätzlich im Master | gbif |
| Cicindela campestris | `mtx_b4f18a2577ab9bb0383c0112129530ec` | Zusätzlich im Master | inaturalist |
| Cokia kowalskae | `mtx_0c9906e5e6c55c151cc58df385f7d024` | Zusätzlich im Master | gbif |
| Eomanis krebsi | `mtx_3375bbe8beb6941e1c577fb567a5700e` | Zusätzlich im Master | gbif |
| Eurotamandua joresi | `mtx_f13549e3e4dbbfa551da594762fe379d` | Zusätzlich im Master | gbif |
| Exogone remanei | `mtx_e12f3c9d5c56564c8f18bf3c19c264eb` | Zusätzlich im Master | catalogue-of-life, gbif |
| Gaeolaelaps ciconia | `mtx_3fc84d77c9942dc61693e6cfefb25bdb` | ID-Wechsel, siehe oben | inaturalist |
| Hawksworthiomyces ciconiae | `mtx_4f004040870dc8405d2d4fc391f3822b` | ID-Wechsel, siehe oben | inaturalist |
| Hyaloperonospora arabidopsidis | `mtx_0905ad4d24639614c355b9e7dbc402f5` | Zusätzlich im Master | catalogue-of-life, gbif |
| Inexpectacantha weisi | `mtx_785be8dbc02e1410a8a985e269812072` | Zusätzlich im Master | catalogue-of-life, gbif |
| Klapperichimorda lutevittata | `mtx_ef8fc3b2b68ff08a22f4e8912e27c75d` | Zusätzlich im Master | wikidata |
| Klapperichimorda quadrimaculata | `mtx_c34ddc339ec1d93bbf37fe9551effaab` | Zusätzlich im Master | wikidata |
| Lactarius intermedius | `mtx_629b9fa524fc462aec5e267350a4e6ff` | Zusätzlich im Master | inaturalist |
| Lasallia sinensis | `mtx_d8412dc2f22786f79084cee7540b881a` | Zusätzlich im Master | catalogue-of-life, gbif |
| Leptoptilos crumeniferus | `mtx_5771241ffaa5b3d43095c89fac048809` | Zusätzlich im Master | gbif |
| Leucopleurus acutus | `mtx_c8f24c8ea3336aad39fc040b07fc474e` | Zusätzlich im Master | worms |
| Oreophrynella weiassipuensis | `mtx_22502e0934d1b8ba6a48c6248e4f1b5c` | Zusätzlich im Master | catalogue-of-life, gbif |
| Ozarkodina eurekaensis | `mtx_143ac2b0c8070cf3126b151918b4aaa3` | Zusätzlich im Master | gbif |
| Ozarkodina ortus | `mtx_26fdb39b2cb26e842a17cf1531a08113` | Zusätzlich im Master | gbif |
| Pactye ciconia | `mtx_b35e67de1d935f059775bab600d9334a` | Zusätzlich im Master | catalogue-of-life, inaturalist |
| Palmatolepis playfordi | `mtx_598dddd8bd590b85ccee0a5fd320bc84` | Zusätzlich im Master | gbif |
| Paraparatrechina weissi | `mtx_b06af3c4ca0d1672f055824194f0ae0c` | Zusätzlich im Master | catalogue-of-life, gbif |
| Pelekysgnathus index | `mtx_bcfda12e2176f772c1f34921d643aa6d` | Zusätzlich im Master | gbif |
| Pisione reducta | `mtx_4d686845e4a8220f2d40b9e06cf71d26` | Zusätzlich im Master | catalogue-of-life, gbif |
| Polygnathus costatus | `mtx_da96ade40bde245c600b9e12294b9b9e` | Zusätzlich im Master | gbif |
| Polypodium fumarioides | `mtx_62fe32f9133e0fb27cb1b960078aa9ca` | Zusätzlich im Master | gbif |
| Pseudogabucinia ciconiae | `mtx_d41d127f308fffc6b929fb99ee2a80e8` | ID-Wechsel, siehe oben | inaturalist |
| Rhizoplacopsis weichingii | `mtx_9e2271675174b44e9863645101cb336f` | Zusätzlich im Master | catalogue-of-life, gbif |
| Rubus weissii | `mtx_5ce53fb8b905d8018312352368fb89aa` | Zusätzlich im Master | catalogue-of-life, gbif |
| Securigera varia | `mtx_47447a9c5e034022933c6e80cce355fd` | Zusätzlich im Master | inaturalist |
| Stachys medebachensis | `mtx_2e21efdc60c570adff6d5b44791721a3` | Zusätzlich im Master | gbif |
| Storchodon cingulatus | `mtx_6bbad0b4ee45cbfbde46c3c87b22292c` | Zusätzlich im Master | gbif |
| Tadarida australis | `mtx_46768ef42738db0760948d02189118db` | Zusätzlich im Master | wikidata |
| Talpa gilothi | `mtx_afabae938f8fe8a86a016fff77c1d915` | Zusätzlich im Master | gbif |
| Typosyllis magnipectinis | `mtx_cb3fd8265d0693d4913e1f81bfc689c2` | Zusätzlich im Master | gbif |
| Zhangolidia weicongi | `mtx_3bea7a65444d9589114c69369a57f774` | Zusätzlich im Master | catalogue-of-life, gbif |
