# Roadmap

Stand: 2026-10-31

## Aktueller Stand

Das Gesamtaudit Phase 10.5 ist seit **27. Oktober 2026 abgeschlossen**. Explorer, Taxonomie, Lightroom,
Medien, Speicher/Restore, Website und GitHub sind im vereinbarten Umfang angenommen. Gesamt-Go,
Prüf-/Veröffentlichungsnachweise und bewusste Nachweisgrenzen stehen ausschließlich im
[Auditauftrag, Abschnitt 10.55](audit-auftrag-phase-10-5.md#1055-lightroom-großprobe-und-gemeinsamer-abschluss--27-oktober).

- **Explorer:** angenommenes Logo und W-Hinweis, gezielte Bedienprüfung sowie isolierte Start-/Speichermessung.
- **Website:** alle 137 Sitemapseiten plus vier Einstiegspfade in drei Ansichten gesichtet; vereinbarte
  Korrekturen als Paket veröffentlicht und gezielt öffentlich nachgeprüft.
- **Lightroom:** Auditabnahme mit regulärem Plug-in **0.4.24.40**; Großprobe auf eigenen Kopien einschließlich genauer
  Rücknahme bestanden. Originalkatalogbestand unverändert; Standardkatalog liegt auf D:.
- **Sicherung:** isolierter Großrestore mit Inhaltsprüfung und Programmstart abgenommen. Die historische
  Testinstallation ist bereinigt; die anschließend beauftragte vollständige NAS-Sicherung vom 28. Oktober
  ist einschließlich Rücklese-, Quell- und Aufbewahrungsprüfung abgeschlossen (Abschnitt 10.57).

Felix hat anschließend Dokumentations-/Dateibereinigung, Temp-Leerung, Sicherungsinventar und nach
Commit/Push einen neuen lokalen Projektchat beauftragt. Der Nachlauf steht in Abschnitt 10.56 desselben
Auditauftrags; die private Belegablage erklärt der [Tempvertrag](temp-retention.md). Im Folgechat hat Felix
die Umbenennung des gemeinsamen Datenordners von `Daten` zu `data` samt nötigen Anpassungen beauftragt.
Der lokale Ordnerwechsel ist ausgeführt; Stand und Prüfgrenzen stehen im [Speichervertrag](storage-migration.md).
Es erfolgt kein neuer Taxonomieaufbau und keine erneute vollständige Auditserie allein wegen des Chatwechsels.

Die anschließend beauftragte Dateiverwendungsprüfung ist im [Strukturvertrag](repo-structure.md#dateiverwendungsprüfung-vom-27-oktober-nach-dem-pfadwechsel)
festgehalten: vollständige physische Inventur, Programm-/Dokument-/Assetprüfung und konkrete Ballastkandidaten.
Eigene neue Testreste sind beleggesichert entfernt. Nach zusätzlichem Auftrag sind auch FFplay, der alte
Einmal-Normalisierer, eine bytegleiche Stagingkarte und die vollständig gegen das NAS-Archiv geprüfte lokale
Audiomigrationskopie entfernt. DD/NE bleiben ausdrücklich als Reserve; geschützte Rückwege sind erhalten.

Felix hat anschließend Commit und Push des gesamten geprüften Folgestands samt Pfadumstellung,
Bereinigung und Dokumentation sowie die Kontrolle des zugehörigen GitHub-Pages-Laufs ausdrücklich beauftragt.
Der Nachweis der tatsächlichen Revision und der Qualitäts-, Artefaktbau- und Deploymentergebnisse wird
nach Ausführung privat unter `data/file-usage-review/2026-10-27/publication/` gesichert. Die örtliche
Speicherkonfiguration und privaten Daten bleiben Git-/Pages-ignoriert; die neue Freigabe umfasst deren
Veröffentlichung nicht. Den anschließenden beauftragten Lightroom-/NAS-Nachlauf führt
[Abschnitt 10.57](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober).

## Regelbetrieb nach dem Audit

Die regulär geladene Version **0.4.24.42** ist seit 28. Oktober gezielt nativ bestätigt.
Der aktuelle Quellstand **0.4.24.43** ergänzt den Installer-Node-Pfad; die native Ladung der neuen Version steht noch aus.
Die Suche erkennt den `data`-Bestand und findet Weissstorch samt Details. Lightroom verwendet den normalen D:-Katalog.
Angenommene Prüfungen nur bei einem Regressionsgrund wiederholen. Geschützte Quellen, Rückwege,
NAS-Archive und dauerhafte Auditbelege bleiben erhalten. Ein künftiger echter Taxonomieaufbau kann
die noch nicht gemessene aktive Fortschritts-/Leistungsbeobachtung ergänzen; dafür keinen reinen
Testaufbau starten. Weitere Umsetzung und Veröffentlichung benötigen Felix' jeweiligen Auftrag.

## Laufende Umsetzung nach Gesamtfreigabe vom 31. Oktober

**Aktuelle Priorität:** Felix hat die weitere Funktionsentwicklung am 31. Oktober wegen des
verbleibenden Creditbudgets pausiert. Ausschließlich gemeldete Fehler beheben und gezielt prüfen;
keine neuen Funktionen oder allgemeinen Vorbereitungsrunden beginnen. Der vorhandene Zwischenstand
bleibt erhalten. Die aktuelle Squarespace-/Bildtexthilfe-Fehlerprüfung führt der
[Bildtextvertrag](image-alt-audit.md).

Felix hat den gemeinsam geklärten Gesamtumfang ausdrücklich bestätigt; erneute Grundsatzbestätigungen
sind dafür nicht nötig. Die weitere Umsetzung bleibt nach seiner Priorisierung pausiert. Am 31. Oktober
hat er nach der Einordnung von **Gemeinsames Projekt** unter **Datenbank-Aktionen → Weitere Aktionen →
Backup und Einstellungen** den Commit und Push des geprüften zusammenhängenden lokalen Standes beauftragt.
Diese Quellveröffentlichung ersetzt keine noch offene NAS-, Installer-, Lightroom- oder Zielgeräteabnahme.

| Bereich | Lokal erreicht | Noch zu vervollständigen |
| --- | --- | --- |
| Gemeinsames Projekt | Rollen-/Anmeldedienst, Versions-/Konfliktkern, atomar paginierter Offlineclient, expliziter Erstimport und neuer Explorerbereich; seitenweise Bildtextbrücke samt Vergleichsdialog isoliert geprüft | Bildtextbrücke durchgehend anschließen, weitere fachliche Abgleiche, initiale Einrichtung und tatsächlicher Mehrgeräte-/NAS-Betrieb |
| Android | APK 0.1.1+2 mit vollständigem öffentlichem Anfangskatalog tatsächlich gebaut und mit 66 Fällen geprüft; Galerie-Offlinedownload im Folgequellstand 0.1.2+3 ergänzt | Folgequellstand analysieren/testen und erneut bauen, dann beide Zielgeräte abnehmen |
| Installer | Echtes privates Prüfpaket sowie isolierte Dateiinstallation, Update/Reparatur und Datenerhalt; Lightroom-Startwegintegration .43 | Nach Integration neu bauen, Auslieferungsnachweise und frischer Windows-/Lightroom-Gerätebetrieb |
| Update-Abschluss | Dauerhafte Auswahl-/Auftragsbindung, Erfolgsnachweis, Countdown und sichere Desktop-/Serververdrahtung | Integrierte native Bedienprüfung und später gezielte reale Abschlussaktion |
| Lokale Bild-/Texthilfe | Schema-/Downloadfehler korrigiert; tatsächliche CPU-Probe mit zwei Bildern und einer Quellenprüfung sowie vollständiger persönlicher Download und nativer Explorer-Bildvorschlag erfolgreich | Redaktionelle Ergebnisprüfung bleibt erforderlich; weitere Anbindung von Textabschnitten ist pausiert |
| Neue Artseiten | Tatsächliche Vorlagen, persistierter CAS-/Freigabe-/CMSplankern und gemeinsamer Transportadapter mit 39 isolierten Fällen geprüft | Durchgehender Editor, tatsächliche Bilderbereitstellung, Vorprüfung und beobachtete kontrollierte CMS-Einpflege |

Das [NAS-Paket](../nas/README.md) und konsistente DB-Sicherung/Restorekopie sind vorbereitet und lokal
geprüft; auf dem NAS wurde nichts installiert. Felix' eigene Alttextbearbeitung hat während der
Hintergrundentwicklung Vorrang. Prüfstand, Betriebsgrenzen und tatsächliche Paketrevisionen stehen
in den jeweiligen Fach-/Modulverträgen, nicht in einer zweiten Auditdatei.

## Beauftragte Arbeiten am 28. Oktober 2026

Felix hat am 27. Oktober diese Reihenfolge für die gemeinsame Fortsetzung am Folgetag festgelegt:

1. **Lightroom-Nachprüfung bestanden:** .42 am regulären Produktpfad aktiviert, normale D:-Katalogadresse
   bestätigt, Datenstände übereinstimmend und Weissstorch-Suche einschließlich drei Detailseiten erfolgreich.
   Keine Zuweisung oder Metadatenaktion; Lightroom anschließend regulär geschlossen.
2. **NAS-Sicherung bestanden:** Vollständiger gebundener Bestand einschließlich `data`, Speicherkonfiguration
   und der lokal getesteten Sicherungskorrektur nach dem [Sicherungsvertrag](multi-device-backup-plan.md)
   gesichert. Vollständige ZIP-Rücklesung, unveränderter Quellstand und Aufbewahrungsprüfung erfolgreich;
   kein Altarchiv entfernt. Zwei Manifest-Kompatibilitätsfehler für die vorhandene PowerShell-7-Laufzeit
   zuvor reproduziert und korrigiert, **38/38** gezielte Prüfungen bestanden. Keine Ausführungsregel geändert.

Beide beauftragten Arbeiten sind abgeschlossen. Der Sicherungsstand enthält die damaligen lokalen
Änderungen; Abschlussquittung und abschließende Dokumentation wurden danach ergänzt. Ein neuer nativer
Restore wurde nicht durchgeführt. Tatsächliche Nachweise und Grenzen ausschließlich im
[Auditnachlauf](audit-auftrag-phase-10-5.md#1057-lightroom-nachprüfung-und-nas-sicherung--28-oktober).

Felix hat anschließend die Veröffentlichung der geprüften NAS-Korrektur samt Abschlussdokumentation
und die Kontrolle des vollständigen GitHub-Pages-Laufs beauftragt. Abgeschlossen mit Commit
[`97a1b68`](https://github.com/felixkfm90/iucn-species-data/commit/97a1b68a2663e62e87c4fa473a917fe83a3f7ec5):
Qualitätsprüfung, Paketbau und Deployment im [zugehörigen Lauf](https://github.com/felixkfm90/iucn-species-data/actions/runs/40720939725)
erfolgreich. Der genaue Veröffentlichungsnachweis liegt gemäß Auditnachlauf privat vor;
örtliche Daten und Einstellungen bleiben ausgeschlossen.

## Entscheidungsfreie Vorarbeiten für die weitere Entwicklung

Felix beauftragt am 28. Oktober zunächst alle Vorarbeiten, die keine neue Nutzerentscheidung benötigen.
Auf dem veröffentlichten Stand `97a1b68` sind die sechs Vorhaben lesend gegen Fachverträge, vorhandene
Module, Tests und tatsächliche Laufzeiten abgeglichen. Wiederverwendbare Bausteine, fehlende Funktionen,
fachliche Entscheidungen und vorbereitete Abnahmefälle stehen in den unten verlinkten Fachverträgen.
Historische Alttextannahmen und alte offene Auditformulierungen sind vom heutigen Stand getrennt.

Für die gemeinsame Abstimmung sind drei Zusammenhänge vorbereitet:

- Alttextredaktion und neue Artseiten teilen Bildauswahl, menschliche Freigabe und kontrollierte CMS-Übernahme.
- Mehrbenutzer-/Datenumfang beeinflusst Installerpfade und Rechte; mobile Schreib-/Synchronisationsfunktionen
  hängen ebenfalls davon ab. Diese Rahmenbedingungen vor der jeweiligen technischen Lösung klären.
- Die Update-Abschlussaktion hat eine vorhandene fachliche Erfolgsgrenze. Aktionsumfang, Abwahl und
  gegebenenfalls eine nachgelagerte Sicherung bleiben gesondert zu vereinbaren.

Felix wählt anschließend den Alternativtextworkflow als erstes Vorhaben. Die Antworten vom 28. Oktober
legen **die gesamte Website**, seitenweise Prüfung, sachliche deutsche Motivtexte ohne wissenschaftliche
Namen und den Erhalt vorhandener sichtbarer Texte fest. Sachliche Korrekturen erfolgen in Absprache;
neue Seiten und neue/geänderte Bilder müssen dauerhaft denselben Ablauf durchlaufen. Die erste Seite
darf ohne weitere Nutzerentscheidung gewählt werden. Der Ablauf gehört direkt in den Arten-Explorer;
vorhandene und fehlende Texte sowie Prüfung und Übernahme müssen sichtbar sein. Nach Freigabe dürfen
die konkreten Texte direkt übernommen werden. Neue Seiten dürfen schon vorher online stehen und
bleiben bei fehlenden Texten offen. Felix bestätigt die Eintragung durch Codex als initial ausreichend
und beauftragt die Umsetzung. Die erste lokale Fassung ergänzt seitenweise Remote-Bildvorschauen,
Entwürfe/Freigaben und öffentliche Nachprüfung; sie schreibt keine CMS-Inhalte. Bedienung, Prüfstand
und Erfassungsgrenzen führt ausschließlich der [Alttextvertrag](image-alt-audit.md).
Die selbstständige Textübernahme per Explorer-Button ist am 29. Oktober zusätzlich beauftragt;
Anmeldeweg und seitenweiser Ablauf sind im Alttextvertrag bestätigt. Die größere Erstellung
**Neuer Artseiten** folgt weiterhin auf die **Mehrbenutzerunterstützung**, damit Felix' Bruder Texte
eingeben und neue Artseiten anlegen kann.
Die übrigen Vorhaben bleiben zur späteren gemeinsamen Abstimmung vorgemerkt.
Am 30. Oktober beauftragt Felix während seiner eigenen Computernutzung die Clusterung vorhandener
Seiten als Hintergrundvorbereitung für Regeln je Seitengruppe und spätere vollständige Artseiten aus
bereitgestellten Bildern und Texten. Die lesende öffentliche Bestandsaufnahme, alle Einzelzuordnungen,
Bausteinunterschiede und offenen Muster-/Regelfragen stehen im
[Artseitenvertrag](add-species-workflow.md#seitengruppen-und-bausteine-vorbereitung-vom-30-oktober-2026).
Keine neue Vorlage oder Veröffentlichungsfunktion ist damit beschlossen; diese Vorbereitung erfolgte
während der Computer-Use-Pause.
Bereits bestätigte Anforderungen gelten weiter. Kein Framework, Benutzer-/Synchronisationsmodell
oder CMS-Schreibweg für die übrigen Vorhaben ist durch diese Vorarbeit beschlossen. Die ursprüngliche
Vorbereitung änderte nur Dokumente; die anschließend freigegebene Alttextumsetzung ergänzt Programmcode
und den privaten Website-Prüfbestand, ohne eine allgemeine Website-/Alttextabnahme vorwegzunehmen.
Felix gibt danach den Rechner für vollständige Vorbereitungen und Tests frei: Der gesamte öffentlich
erfasste Bildbestand ist visuell gesichtet und mit Entwürfen im Explorer vorbereitet, einschließlich
der automatisch geladenen Artgrafiken. Die menschliche Textabnahme ist für den Folgetag vorgesehen;
konkrete Beschriftungsfragen sind am Bild markiert. Öffentliche Texte bleiben bis zu dieser Freigabe erhalten.

Die vertieften Vorarbeiten vom 30. Oktober sind ebenfalls vorbereitet: konkrete Daten-/Schreibwege und
sieben Konfliktfälle für [Mehrbenutzerbetrieb](multi-device-backup-plan.md#vertiefte-vorbereitung-vom-30-oktober-2026),
fünf isolierte Installerproben samt Herkunfts-/Lizenzlücken, zwei vollständige
[Artseitenbeispiele](add-species-workflow.md#zwei-vollständig-aufgenommene-artseitenbeispiele),
native [Squarespace-Feldinventur und lokaler Pages-Bau](image-alt-audit.md#native-cms-feldinventur-und-veröffentlichungsvorbereitung-vom-30-oktober-2026)
sowie kleine [Bedientextkorrekturen](desktop-shell-plan.md#gezielte-bedientextprüfung-vom-30-oktober).
Keine neue Vorlage, Benutzerarchitektur oder Installertechnik festgelegt. Fachentscheidungen bleiben
zur gemeinsamen Abstimmung offen; Veröffentlichung und neue vollständige NAS-Sicherung stehen gesondert aus.

## Vereinbarte Aufgaben nach dem Audit

Die erneuten entscheidungsfreien Vorarbeiten vom 31. Oktober sind im jeweiligen Fachvertrag ergänzt:
Originalherkunft der vorhandenen Node-/FFmpeg-Programme bestätigt, lokale Parallelitäts-/Sperrproben
ausgeführt und der dabei reproduzierte Einstellungs-Schreibfehler korrigiert. Android-Bausteine und
Update-Abschlussgrenzen sind konkret quellengebunden vorbereitet; 28 zusätzliche isolierte Fälle bestehen.
Ein nachgewiesener Nachlauf der stillen Versionsprüfung ist ebenfalls korrigiert; der Dienst wartet
beim Beenden auf deren Schreibabschluss. Die alten eigenen Testreste sind beleggerecht überführt.
Der frische Sitemapabgleich findet keine neue Seite, kurze Entwürfe für alle 33 langen Beschriftungsfälle
liegen bereits vor. Die private Gesamtaufnahme `data/website/checks/followup-readiness-20261031.json`
verbindet Vorbereitung, noch nötige Fachentscheidungen und spätere praktische Prüfungen.
Die gebundene Abschlussquittung `data/website/checks/followup-completion-20261031.json` enthält
die 465 bestandenen Verhaltenstests, Zusatzproben, unveränderten Originaldaten und Belegüberführung.
Damit sind die Großvorhaben zur Abstimmung vorbereitet; Installer, Benutzerabgleich, Android und
automatische Systemaktion sind noch keine fertigen Funktionen, bei denen ausschließlich Tests fehlen.

Vor jedem der folgenden größeren Vorhaben klären Felix und Codex zunächst gemeinsam Zielverständnis,
Anwendungsfälle, Umfang und Rahmenbedingungen gemäß der [Arbeitsregel](../AGENTS.md#arbeitsweise-bei-späteren-einzelaufträgen).
Erst aus dieser bestätigten Grundlage werden Lösung und Umsetzung abgeleitet. Die weitere Reihenfolge
der Vorhaben wird ebenfalls gemeinsam festgelegt.

Die [Rahmenklärung vom 31. Oktober](multi-device-backup-plan.md#gemeinsame-rahmenklärung-vom-31-oktober-2026)
bestätigt zwei gleichberechtigte Personen mit Administrationsrechten auf eigenen PCs, spätere Handynutzung
zum Nachschlagen, parallele Arbeit an unterschiedlichen Arten/Seiten, verschiedene Arbeitsorte und eine
Offlineoption. Gemeinsame fachliche Daten, Lightroom-Katalog und Auswertungen gehören zu einem
FN-Wildlife-&-Travel-Projekt; der Katalog wird nacheinander auf verschiedenen Geräten verwendet.
Vier Benutzerstufen sind angenommen, weitere Benutzer sollen möglich bleiben. Der gemeinsame Dienst
muss auch bei ausgeschalteten PCs erreichbar sein. Offlineumfang und Kostenrahmen sind bestätigt,
Betriebsort und technische Ausgestaltung noch zu prüfen: Offline am PC vorhandene Arten/Seiten bearbeiten, am Handy auswählbare
Nachschlageinhalte, auch ohne Websitefotos. Zielgeräte sind Windows 11 mit Installationsrechten sowie
Android auf S24 Ultra und S25 Ultra. Zusätzliche kostenpflichtige Dienste sind ausgeschlossen; das
vorhandene NAS läuft laut Felix grundsätzlich 24/7 mit USV und ist als Betriebsort zu prüfen.
Felix hat den zusammenhängenden Gesamtumfang am 31. Oktober ausdrücklich bestätigt und die Umsetzung
beauftragt. Die Rahmenklärung ist abgeschlossen; technische Routineentscheidungen und Umsetzung folgen
selbstständig daraus. Weitere NAS-Informationen hat Felix angekündigt. Neue fachliche Änderungen und
Veröffentlichungen bleiben an den jeweiligen tatsächlichen Freigabeumfang gebunden.

- **[Alternativtextworkflow](image-alt-audit.md):** Gesamter öffentlich erfasster Bildbestand mit Entwürfen vorbereitet;
  kompakte Exploreransicht, seitenweise Freigabe und direkter Reisegalerie-Übernahmebutton umgesetzt.
  Athen **9/9**, Delphi **8/8** und Mykene **8/8** sind öffentlich bestätigt; die Texte werden weiterhin
  seitenweise mit Felix geprüft. Kurze Reise-Unterseiten-Beschriftungen ohne abschließenden Punkt,
  vorhandener Header-Linktext und bekannte dekorative Standards bleiben vereinbart.
  Gesamtprüfung mit 2.558 Fällen, isolierter Store-Restore und native Übernahmen sind im Fachvertrag
  belegt. Weitere CMS-Feldtypen und lange sichtbare Beschriftungen bleiben zur gezielten Abstimmung offen.
  Neue/geänderte Bilder und Seiten müssen dauerhaft denselben Prüfablauf durchlaufen.
- **[Neue Artseiten](add-species-workflow.md#vorbereitung-des-künftigen-website-artseitenworkflows):** Bestehende Strukturen, Texte, Bilder, Alternativtexte und Explorer-Verknüpfungen
  in einen gemeinsamen prüfbaren Erstellungs- und Einpflegeablauf integrieren. Folgt auf den benötigten
  Mehrbenutzerausbau; dabei die spätere automatische Textübernahme mitbetrachten. Die vorhandenen
  Seitenfamilien, Bausteine und Varianten sind im Artseitenvertrag als Abstimmungsgrundlage vorbereitet.
  Bestätigt sind bereitgestellte Bilder mit festlegbarer Reihenfolge, gegliederte Fachtexte, änderbare
  Alternativtextvorschläge und ausdrückliche Entscheidung über leere Abschnitte. Codex prüft vor;
  Felix beziehungsweise sein Bruder nehmen die zusammengesetzte Seite vor Veröffentlichung abschließend ab.
  Vorschläge und Vorprüfung sollen direkt im Explorer ohne diesen Chat und ohne kostenpflichtige Dienste
  erfolgen; eine geeignete lokale Lösung ist zunächst praktisch zu prüfen.
- **[Android-App](desktop-shell-plan.md#vorbereitung-der-android-abstimmung-vom-28-oktober):** Nachschlagewerk für angelegte Arten mit Bildern, Ton, Taxonomie, Verbreitung und Informationen auf S24 Ultra und S25 Ultra. Bearbeitung am PC; am Handy werden Lightroom und die gesamte Referenzdatenbank nicht benötigt. Inhaltsaktualisierung und wählbare Offlinepakete einschließlich einer Auswahl ohne Websitefotos vorsehen.
- **[Installer einschließlich aller benötigten Programme](multi-device-backup-plan.md#entscheidungsfreie-vorbereitung-vom-28-oktober-2026):** Einen vollständigen Windows-Installationsablauf
  mit benötigten Laufzeiten, Hilfsprogrammen, Abhängigkeiten und Plug-in-Einrichtung konzipieren und umsetzen.
  Ziel Windows 11 mit Administratorrechten bestätigt. Erstinstallation, Aktualisierung und Erhalt vorhandener Daten praktisch prüfen.
- **[Mehrbenutzerunterstützung](multi-device-backup-plan.md#mehrbenutzer-heutige-funktionen-und-fehlende-erweiterungen):** Nutzung durch mehrere Personen und auf mehreren Rechnern konzipieren und
  umsetzen; angenommene Benutzerstufen, gemeinsame fachliche Daten und Verfügbarkeit ohne laufende PCs
  zugrunde legen, Schutz vor Bearbeitungskonflikten konkretisieren. Den bestehenden Mehrgeräte-/Update-/Sicherungsplan dabei einbeziehen.
- **Abschlussaktion nach Datenbankaktualisierung:** Vor dem Start wählen können, was nach vollständig
  erfolgreichem Abschluss passiert: nichts tun, Explorer beenden, PC herunterfahren oder PC neu starten.
  Standard bleibt nichts tun; Fehler, Abbruch oder wartende Schritte dürfen keine Erfolgsaktion auslösen.
  Keine zusätzliche NAS-Sicherung davor; die Routine bleibt zeitgesteuert. Details im [Updatevertrag](taxonomy-update-automation.md#vorgemerkt-wählbare-abschlussaktion-nach-erfolgreichem-update).

Die verbindlichen Ziele der ersten drei Vorhaben stehen im Auditauftrag, Abschnitte 10.46 und 10.47.
Installer und Mehrbenutzerunterstützung hat Felix am 27. Oktober im Folgechat ergänzt; die fachliche
Einordnung steht im [Mehrgeräte-/Backupplan](multi-device-backup-plan.md). Die wählbare Update-Abschlussaktion
hat Felix anschließend ebenfalls vorgemerkt. Alle sechs Vorhaben sind aufgenommen; die konkrete Umsetzung
richtet sich nach dem jeweiligen Folgeauftrag. Frühere Ausbauideen
sind keine laufenden Umsetzungsaufträge.

## Fachstände

- [Taxonomie-Betriebsstand](taxonomy-current-status.md)
- [Lightroom-Vertrag](lightroom-search-package.md)
- [Aktuelle Arten-/Assetzähler und Pflegelisten](project-status.md)
- [Dokumentationsübersicht und historische Nachweise](README.md)

Weitere Arbeiten und Veröffentlichungen richten sich nach Felix’ jeweiligem Auftrag.
