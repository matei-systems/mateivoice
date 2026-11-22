# Rechtliche Anforderungen DACH – Recherche, Umsetzung, offene Fragen

> **Keine Rechtsberatung.** Diese Übersicht ist eine technische Vorbereitung auf Basis öffentlich
> zugänglicher Quellen (Stand der Recherche: November 2026). Sie ersetzt keine Prüfung durch
> Rechtsanwältinnen/Rechtsanwälte und Steuerberatung in **Österreich, Deutschland und der Schweiz**.
> Vor dem Echtbetrieb sind alle mit ⚖️ markierten Punkte verbindlich zu klären.
>
> Legende: **✅ umgesetzt** (technisch vorhanden und getestet) · **🟡 vorbereitet** (Mechanik vorhanden,
> Inhalt/Anbieter fehlt) · **⚖️ offen** (rechtliche Entscheidung nötig) · Quellenangaben am Ende jedes Abschnitts.
>
> Unterscheidung: **„Bestätigt“** = steht so im Gesetz bzw. in einer amtlichen Quelle, die wir eingesehen haben.
> **„Zu prüfen“** = plausible Anforderung oder Auslegung, die anwaltlich bestätigt werden muss.

Siehe auch: [frühere AT-Fragenliste](LEGAL-OPEN-QUESTIONS-AT.md) (Stage 1), [Zahlungsanbieter](PAYMENT-PROVIDERS.md), [Streaming](STREAMING.md).

---

## 1. Jugendschutz und Altersprüfung

### Deutschland (JMStV)
- **Bestätigt:** Pornografische Angebote in Telemedien sind nach § 4 Abs. 2 Satz 2 JMStV nur zulässig, wenn der
  Anbieter sicherstellt, dass sie ausschließlich Erwachsenen zugänglich sind (geschlossene Benutzergruppe).
  Der JMStV definiert „Sicherstellen“ nicht näher; die KJM bewertet Altersverifikationskonzepte nach ihrem
  **AVS-Raster** (Fassung gültig seit 12.05.2022): Altersverifikation in zwei verbundenen Schritten –
  **Identifizierung** (persönliche Altersprüfung) und **Authentifizierung** bei jeder Nutzung.
- **Bestätigt (Rechtsprechung, sekundär zitiert):** OLG Nürnberg (2005) verlangt persönliche Identifikation mit
  Altersprüfung; einfache Altersabfragen, Geburtsdatum-Eingaben oder bloße Kreditkartenprüfungen gelten als
  unzureichend.
- **Umsetzung:** ✅ Für **alle Startländer** gilt standardmäßig „Altersprüfung über Anbieter erforderlich“
  (Einstellung `ageAssurance`, je Land konfigurierbar). Ohne Prüfung: kein Stream, kein Chat, keine privaten
  Chats, keine Käufe, keine Trinkgelder (serverseitig erzwungen, getestet). Authentifizierung = Login mit
  Passwort (+ optional 2FA). 🟡 Ein KJM-positiv bewerteter Prüfanbieter ist **noch nicht ausgewählt**; der
  Mock-Anbieter kann per DB-Constraint nie „verifiziert“ erzeugen.
- ⚖️ Auswahl eines Anbieters mit KJM-Positivbewertung bzw. FSM-Prüfung; Klärung, ob die Gesamtlösung
  (Login-Authentifizierung je Sitzung) den Anforderungen genügt; Jugendschutzbeauftragte/r erforderlich?

### Österreich
- **Bestätigt:** Das Pornographiegesetz (BGBl. 97/1950, RIS-Gesetzesnummer 10005226) stellt u. a. das
  Anbieten unzüchtiger Darstellungen an Personen unter 16 Jahren unter Strafe (§ 2). Die Landes-Jugendschutzgesetze
  regeln Jugendliche zwischen 16 und 18. Wir konnten die konsolidierte RIS-Fassung von §§ 1–2 nicht vollständig
  automatisiert abrufen (RIS zeitweise nicht erreichbar) – ⚖️ Fassung anwaltlich bestätigen lassen.
- **Bestätigt:** § 207a StGB (pornografische Darstellungen Minderjähriger) – absolute Grenze; § 215a StGB.
- **Umsetzung:** ✅ Selbe strenge Altersprüfung wie für DE (konservativer Standard); ✅ kritische Meldungen
  (Verdacht Minderjährige) mit höchster Priorität, automatischer Beweissicherung und Benachrichtigung.
- ⚖️ Ist für AT eine Verifikation gesetzlich zwingend oder genügt ein geringerer Standard? (Wir behalten
  „verifiziert“ bei, bis anwaltlich geklärt.)

### Schweiz
- **Bestätigt:** Art. 197 StGB (Pornografie) – u. a. Zugänglichmachen an Personen unter 16 strafbar.
- **Bestätigt (BSV):** Das Bundesgesetz über den Jugendschutz in den Bereichen Film und Videospiele (JSFVG,
  laut unserer Recherche SR 446.2 – Nummer auf fedlex verifizieren) und die Verordnung (JSFVV) sind seit **1. Januar 2025 teilweise in Kraft**; das Gesetz tritt
  gestaffelt in Kraft. Für Plattformdienste sind Alterskontrolle und Meldesystem vorgesehen (Art. 20 JSFVG).
  Laut Erläuterungsbericht gilt das Auslesen der maschinenlesbaren Zone eines amtlichen Ausweises als geeignet,
  der Besitz einer Kreditkarte nicht. Bussen bis CHF 40 000.
- ⚖️ Fällt eine Live-Webcam-Plattform unter „Plattformdienste“ i. S. d. JSFVG? Ab wann gelten die
  Plattformpflichten? SR-Nummer und Fristen auf fedlex verifizieren (fedlex war für die automatisierte
  Recherche nicht lesbar).

**Quellen:** [KJM AVS-Raster (PDF)](https://www.kjm-online.de/fileadmin/user_upload/KJM/Themen/Technischer_Jugendmedienschutz/AVS-Raster_ueberarbeitet_gueltig_seit_12.05.2022__004_.pdf) ·
[JMStV § 4 (gesetze-bayern.de)](https://www.gesetze-bayern.de/Content/Pdf/JMStV-4?all=False) ·
[Bundestag WD 8 – 049/25](https://www.bundestag.de/resource/blob/1108608/WD-8-049-25.pdf) ·
[RIS Pornographiegesetz (Gesetzesnummer 10005226)](https://www.ris.bka.gv.at/GeltendeFassung.wxe?Abfrage=Bundesnormen&Gesetzesnummer=10005226) ·
[BSV: Jugendschutz Film und Videospiele](https://www.bsv.admin.ch/de/jugendschutz-in-den-bereichen-film-und-videospiele-jsfvg) ·
[JSFVG Gesetzestext (jugendundmedien.ch, PDF)](https://jugendundmedien.ch/fileadmin/PDFs/anderes/JSFVG/JSFVG_DE.pdf) ·
[Erläuternder Bericht JSFVV](https://jugendundmedien.ch/fileadmin/PDFs/anderes/JSFVG/d-02-Erlaeuternder_Bericht_JSFVV.pdf)

## 2. Creator: Alter, Identität, Einwilligung, Rechte

- **Bestätigt (Kartennetzwerke, sekundär + Mastercard-Mitteilung 2021):** Mastercard verlangt seit 2021 für
  Adult-Content-Händler (Standards „AN 5196“): Registrierung durch den Acquirer, **dokumentierte Alters- und
  Identitätsprüfung aller dargestellten und hochladenden Personen**, schriftliche Vereinbarung mit jedem
  Content-Provider, **Prüfung von Inhalten vor Veröffentlichung**, Beschwerdeverfahren für rechtswidrige/nicht
  einvernehmliche Inhalte binnen **7 Werktagen**, Entfernungsmöglichkeit für dargestellte Personen.
  ⚖️ Aktuellen Wortlaut über Acquirer/PSP beziehen (die offizielle Regeltext-Fassung lag uns nicht vor).
- **Umsetzung:**
  - ✅ Veröffentlichung nur mit: bestätigter E-Mail, Alters-/Identitätsprüfung (echter Anbieter; im Testmodus
    simuliert und gekennzeichnet), **sechs Pflichterklärungen** (Volljährigkeit/Identität, nur verifizierte
    Personen im Bild, Rechte an Inhalten, Freiwilligkeit, keine Aufzeichnung/Weitergabe, Regeln) – versioniert
    und **unveränderlich** gespeichert (DB-Trigger) – sowie **manueller Freigabe** (keine Selbstprüfung).
  - ✅ Bilder werden vor Veröffentlichung moderiert; Live-Streams sind nur nach Freigabe möglich.
  - ✅ Meldungen zu Chatnachrichten, Profilen, Sitzungen, Medien; kritische Kategorien priorisiert.
  - 🟡 Schriftliche Creator-Vereinbarung: Entwurf vorhanden, rechtlich zu prüfen.
  - ⚖️ Mehrpersonen-Inhalte sind gesperrt (Erklärung „nur verifizierte Personen“); Co-Performer-Verifizierung
    ist nicht implementiert.

**Quellen:** [Mastercard: Preventing illegal adult content (2021)](https://www.mastercard.com/news/perspectives/2021/protecting-our-network-protecting-you-preventing-illegal-adult-content-on-our-network/) ·
[Zusammenfassung adultbizlaw.com](https://adultbizlaw.com/2021/04/27/mastercards-new-rules-the-details-for-paysite-and-platform-owners-operators/) (sekundär)

## 3. Plattformpflichten: Digital Services Act (DSA) und nationale Begleitgesetze

- **Bestätigt:** Verordnung (EU) 2022/2065 (DSA) gilt seit 17.02.2024. Für Hosting-Dienste: Melde- und
  Abhilfeverfahren (Art. 16), **Begründung von Entscheidungen** (Art. 17). Für Online-Plattformen
  zusätzlich u. a. internes Beschwerdemanagement (Art. 20), außergerichtliche Streitbeilegung (Art. 21),
  Transparenz, Schutz Minderjähriger (Art. 28). Art. 19 nimmt **Klein- und Kleinstunternehmen** von
  Teilen der Plattformpflichten aus (Abschnitt 3); die Reichweite für Art. 17 wird unterschiedlich dargestellt
  → ⚖️ prüfen. Wir setzen die Pflichten **unabhängig von der Ausnahme** um.
- **Bestätigt (AT):** DSA-Begleitgesetz BGBl. I Nr. 182/2023: KommAustria ist Koordinator für digitale
  Dienste (KDD-G); das **Kommunikationsplattformen-Gesetz (KoPl-G) wurde aufgehoben**.
- **Bestätigt (DE):** Das Digitale-Dienste-Gesetz (DDG) ersetzt seit 2024 das TMG (Impressumspflicht § 5 DDG).
  ⚖️ Anbieterkennzeichnung erst nach Gründung möglich (keine erfundenen Angaben).
- **Umsetzung:**
  - ✅ Meldungen (Art. 16) inkl. Kategorie, Beschreibung, Bestätigung an Meldende.
  - ✅ **Statement of Reasons (Art. 17):** Jede Maßnahme (Sperre, Verwarnung, Profil ausblenden, Inhalt entfernen,
    Nachricht löschen, Stummschaltung, Stream beenden, Aufhebung) wird mit Begründung und optionaler
    Regelangabe **unveränderlich** gespeichert, der betroffenen Person mitgeteilt und im Datenexport ausgegeben.
  - ✅ Einspruch gegen Maßnahmen (interne Beschwerde) mit Prüfung durch eine andere Person.
  - 🟡 Transparenzbericht: Daten vorhanden (Meldungen, Maßnahmen), Bericht-Export noch nicht implementiert.
  - ⚖️ Kontaktstelle für Behörden/Nutzer (Art. 11/12), gesetzlicher Vertreter (falls Sitz außerhalb der EU).

**Quellen:** [DSA – EUR-Lex 2022/2065](https://eur-lex.europa.eu/eli/reg/2022/2065/oj) ·
[EU-Kommission, Pressemitteilung 17.02.2024](https://ec.europa.eu/commission/presscorner/api/files/document/print/en/ip_24_881/IP) ·
[BGBl. I Nr. 182/2023 (RIS)](https://ris.bka.gv.at/Dokumente/BgblAuth/BGBLA_2023_I_182/BGBLA_2023_I_182.html) ·
[BMJ: DSA-Begleitgesetz](https://www.bmj.gv.at/dam/jcr:ee930a80-16bb-463b-a43e-4b4df9fd1f88/DSA-Begleitgesetz.pdf)

## 4. Audiovisuelle Mediendienste (AT: AMD-G / DE: MStV)

- ⚖️ **Zu prüfen:** Ob Live-Webcam-Angebote als audiovisueller Mediendienst (Fernsehähnlichkeit, redaktionelle
  Verantwortung) oder Video-Sharing-Plattform im Sinne des AMD-G (AT) bzw. Medienstaatsvertrags (DE) gelten.
  Private 1:1-Chats sind tendenziell Individualkommunikation; öffentliche Streams könnten anders zu bewerten sein.
  Ggf. Anzeigepflicht bei KommAustria. Keine Annahme getroffen.

## 5. Datenschutz (DSGVO, AT-DSG, CH-DSG)

- **Bestätigt:** DSGVO gilt für AT und DE; für die Schweiz gilt das revidierte DSG (seit 1.9.2023) – bei
  Ausrichtung auf CH-Kundschaft sind beide zu beachten. Sexualleben betreffende Daten sind besondere
  Kategorien (Art. 9 DSGVO) – die Nutzung einer Adult-Plattform kann Rückschlüsse zulassen.
- **Umsetzung:** ✅ Datensparsamkeit (Nutzername statt Klarname; IP nur als HMAC-Hash; keine Ausweisdaten;
  IBAN AES-256-GCM-verschlüsselt, nur maskiert angezeigt); ✅ Datenexport (Art. 15/20) inkl. neuer Bereiche;
  ✅ Löschung mit Prüfung von Hinderungsgründen (Beweissicherung, offene Auszahlung, echtes Guthaben) und
  Protokoll; ✅ Datenschutzanfragen-Register für Berichtigung/Widerspruch; ✅ Aufbewahrungsjob (Chat, E-Mail-
  Protokoll, abgelaufene Sitzungen/Token) mit Ausnahme gesicherter Objekte; ✅ E-Mail-Inhalte werden nach
  Versand gelöscht.
- ⚖️ Verzeichnis von Verarbeitungstätigkeiten, DSFA (wahrscheinlich erforderlich: sensible Daten, Video,
  Altersprüfung), Auftragsverarbeitungsverträge (Hosting, Mail, Video, Zahlungen, Altersprüfung),
  Drittlandtransfers, Aufbewahrungsfristen für Buchungsdaten (AT: § 132 BAO, 7 Jahre; DE: §§ 147 AO/257 HGB,
  bis 10 Jahre – zu bestätigen), Cookie-/Endgerätezugriff (derzeit nur technisch notwendige Cookies).

## 6. Zahlungen, Verbraucherschutz, Steuern

- **Bestätigt (Verbraucherrecht EU):** Für digitale Inhalte/Dienstleistungen kann das Widerrufsrecht bei
  ausdrücklicher Zustimmung zur sofortigen Ausführung und Bestätigung der Kenntnis erlöschen (Verbraucherrechte-
  Richtlinie 2011/83/EU). Preisangaben müssen Endpreise inkl. USt. sein (AT: PrAG, DE: PAngV).
  ✅ Pakete werden mit Bruttopreis und Preis je 100 Münzen angezeigt. 🟡 Zustimmungs-Checkbox zum Erlöschen des
  Widerrufsrechts im Checkout ⚖️ (Text und Ablauf anwaltlich festlegen).
- **Bestätigt (USt.):** Art. 9a der Durchführungsverordnung (EU) Nr. 282/2011 – bei elektronisch erbrachten
  Dienstleistungen an Verbraucher, die über eine Plattform vermittelt werden, gilt die Plattform grundsätzlich
  als im eigenen Namen leistend („deemed supplier“); vom EuGH bestätigt (C-695/20). Ort der Leistung =
  Wohnsitz des Verbrauchers → USt. des Kundenlandes (20 % AT / 19 % DE), Abwicklung über OSS.
  ⚖️ **Folge für das Provisionsmodell:** Die USt. fällt auf den vollen Kaufpreis bei der Plattform an. Die
  75/25-Aufteilung bezieht sich hier auf Münzen; der Auszahlungswert je Münze (`payout.centsPer100Coins`,
  vorläufig 1,00 € je 100 Münzen) muss steuerlich und kaufmännisch festgelegt werden.
- **Schweiz:** Ausländische Anbieter elektronischer Dienstleistungen werden bei weltweitem Umsatz ab
  CHF 100 000 MWST-pflichtig (Steuersatz 8,1 %) – ⚖️ prüfen.
- **Bestätigt (DAC7/DPMG):** Plattformbetreiber müssen Einkünfte von Anbietern bestimmter Tätigkeiten (u. a.
  **persönliche Dienstleistungen**) jährlich bis 31.1. melden; AT-Umsetzung: Digitale Plattformen-
  Meldepflichtgesetz (DPMG, seit 1.1.2023), inkl. Sorgfaltspflichten (Identifikationsdaten, Steuer-ID).
  ⚖️ Gelten Creator-Leistungen als „persönliche Dienstleistungen“? Erhebung der Pflichtdaten (Steuer-ID,
  Geburtsdatum, Anschrift) – **noch nicht implementiert** (bewusst: erst mit KYC-Anbieter).
- **Creator-Status:** ⚖️ Selbstständigkeit vs. Arbeitnehmerähnlichkeit (Scheinselbstständigkeit),
  Gewerbeanmeldung der Creator, Steuerpflicht der Creator – Hinweise in der Creator-Vereinbarung.

**Quellen:** [Art. 9a DVO 282/2011 (Text)](https://www.legislation.gov.uk/eur/2011/282/article/9a/data.htm) ·
[EuGH C-695/20 (Urteil)](https://www.bailii.org/eu/cases/EUECJ/2022/C69520_O.html) ·
[EU-Kommission Explanatory Notes 2015](https://taxation-customs.ec.europa.eu/system/files/2016-09/explanatory_notes_2015_en.pdf) ·
[DPMG (RIS)](https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40246130/NOR40246130.pdf) ·
[BMF-Info DPMG (findok)](https://findok.bmf.gv.at/findok/resources/pdf/dbe8aaf2-a8da-4a0d-a2ee-581463d968ae/82976.1.1.pdf) ·
[KPMG AT: DAC7/DPMG](https://kpmg.com/at/de/media/newsletter/tax-news/2023/12/tn-dac7-dpmg.html) (sekundär)

## 7. Gewerbe- und Medienrecht Österreich (Betrieb)

- ⚖️ Gewerbliche Tätigkeit des Betreibers (freies Gewerbe „Dienstleistungen in der automatischen
  Datenverarbeitung“? Vermittlung?), Offenlegungspflichten nach Mediengesetz (§ 25) und Impressum nach § 5 ECG,
  Firmenbuch/UGB § 14. Landesrechtliche Prostitutionsgesetze: nach derzeitiger Einschätzung kein körperlicher
  Kontakt → ⚖️ bestätigen lassen (Wien, Steiermark u. a. unterschiedlich).

## 8. Zusammenfassung: Was vor dem Echtbetrieb zwingend zu klären ist

1. Gesellschaftsgründung, Anbieterkennzeichnung (Impressum), DSA-Kontaktstellen.
2. Altersverifikation: Anbieter mit KJM-Positivbewertung (DE) und Konformität mit JSFVG (CH); AT-Standard bestätigen.
3. Zahlungsanbieter mit schriftlicher Freigabe für **genau dieses** Modell (Live-Cam, Münzen, Trinkgelder,
   Marktplatz mit Auszahlungen an Creator) – siehe [PAYMENT-PROVIDERS.md](PAYMENT-PROVIDERS.md).
4. Steuerstruktur: deemed supplier/OSS, CH-MWST, DAC7-Datenerhebung, Auszahlungswert je Münze.
5. Creator-Vereinbarung, AGB, Datenschutzerklärung, Widerrufsbelehrung (Erlöschen bei digitalen Leistungen).
6. Medienrechtliche Einordnung (AMD-G/MStV) öffentlicher Streams.
7. DSFA, Auftragsverarbeitungsverträge, Löschkonzept mit Aufbewahrungsfristen.
