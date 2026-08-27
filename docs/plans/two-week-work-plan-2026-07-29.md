# vpsAdmin WebUI Next: podrobný plán na dva týdny

Plánováno: **29. 7. 2026**

Realizace: **30. 7. - 12. 8. 2026**

Kapacita: **10 pracovních dnů / přibližně 75 soustředěných hodin**

Pracovní baseline: `codex/codebase-security-cleanup` / `a6aecb4`

## Co se oproti předchozí verzi mění

Předchozí verze byla příliš konzervativní a několik částečně hotových věcí
popisovala jako nové funkce. Tato verze vznikla po dalším auditu aktuálního
HEAD, samostatných feature větví, API capability matice a cílených testů.

- každý pracovní den má dva navazující viditelné výsledky nebo jednu velkou
  vertikálu a skutečný bezpečnostní/performance hardening,
- již hotové DNS rozlišení, prázdné TTL, větší traffic graf, status lokace,
  účet a VPS permission split se znovu neimplementují,
- samostatné větve pro Praha IP, subdatasety a CVE se berou jako zdroj pro
  selektivní port, ne jako práce od nuly ani jako slepý merge,
- u každého dne je výslovně odděleno **co už funguje** a **co se teprve dodělá**,
- 30. 7. není „zavést Praha IP a subdatasety“: obojí už částečně existuje;
  cílem je dokončit celou samoobsluhu vlastních subdatasetů a zpevnit výběr IP,
- incident create pro běžného uživatele se nejdřív řeší jako potvrzený API
  blocker; frontend nesmí předstírat funkci, kterou backend zakazuje,
- závěrečný den zůstává plnohodnotný release/hardening den, ne rezerva bez
  konkrétního obsahu.

## Ověřená realita k 29. 7. 2026

### Hotovo v aktuálním HEAD - neplánovat znovu

| Oblast | Co už opravdu existuje | Důkaz v projektu |
|---|---|---|
| Navigace | Stavy akcí nejsou v primárním sidebaru; deep-link detail z Úloh zůstává | `AppSidebar.tsx` + testy |
| Status | Lokality jsou panelově oddělené stejně po přihlášení i anonymně | dashboard/public unit + E2E |
| Datasety | Pokročilé ZFS vlastnosti jsou pro usera skryté; user už umí založit subdataset z NAS seznamu přes `/app/nas/new` | `NasDatasetsPage.tsx`, `NasDatasetCreatePage.tsx`, `nas_smoke.spec.ts` |
| VPS | User nevidí start timeout, owner, CPU limit, admin lock/override a další admin pole | permission testy detailu VPS |
| Účet | Osobní údaje, timezone, heslo, MFA/TOTP, WebAuthn, relace, SSH, metriky, mail, user-data a namespaces | profile stránky + E2E |
| Modaly/tabulky | Centrované modaly a číslované stránkování jsou sdílený vzor | shared UI komponenty |
| DNS detail | Primary a secondary mají rozdílné záložky; secondary nemá CRUD záznamů | `DnsZoneLayout.tsx`, `DnsZoneRecordsPage.tsx` |
| DNS záznam | Preview už nedominuje formuláři; nové TTL je prázdné a používá default zóny | `DnsRecordModel.ts` + test |
| DNS pořadí | Transakce jsou pod vlastním obsahem zóny | detail zóny |
| Síť user | Vlastní/přiřazené IP jsou scopeované; VPS nabídka respektuje typ a lokalitu | user-network model + E2E |
| Traffic user | Přehled/rozpad, šest měsíců historie a větší graf už existují | `UserNetworkTrafficCard.tsx` |
| Síť admin | Základní live a traffic stránky existují; Praha Production už se řadí nahoru a vzorkuje po třech adresách v bucketu | `suggestedFreeIps.ts`, `IpAddressesPage.tsx` |
| Security baseline | Typecheck, build, 565 unit testů, 15 BFF security testů a repo audity byly zelené | `CODE_HEALTH_SECURITY_AUDIT_2026-07-29.md` |

### Implementováno v samostatné větvi - selektivně portovat

| Větev / commit | Stav | Co je potřeba při integraci |
|---|---|---|
| `e5abd0b` | zpevnění už existujícího Praha Production vzorku je hotové mimo HEAD | doplnit owner filter, max. 8 keyset stránek, přesných 3 public IPv4 + 3 private IPv4 + 3 IPv6 a mobil/desktop test |
| `743dc9a` + `fb211f9` | rozšíření existujícího NAS create na jednotnou správu z datasetu/VPS je hotové mimo HEAD | vyřešit dva changed-both test soubory, prověřit capability/owner gate živým účtem |
| `deb8b7e` | admin CVE správa, lifecycle, vztahy, public detail a testy hotové mimo HEAD | ručně rozdělit 55 souborů / 7k+ řádků; opravit role-only gate a prověřit privacy odpovědi API |

### Potvrzené mezery nebo blokery

| Oblast | Skutečný stav | Rozhodnutí pro plán |
|---|---|---|
| Incident user create | capability matice uvádí `IncidentReport::Create = admin_only`; user má jen index/show vlastních | 1-2 h live proof + přesné upstream zadání; bez API změny žádné falešné CTA |
| Secondary DNS create | create formulář vždy posílá `source: internal_source` a nemá typ/serverová pole | plná vertikála primary/secondary create |
| DNS transfer log | současné Transfery jsou konfigurace a snapshot `dns_server_zones`, ne `dns_server_zone_transfer_log` | nový API klient, skutečná historie, detail a testy |
| TSIG user scope | transfer page načítá až 200 klíčů bez user filtru; secret může být znovu vykreslen ze seznamu | oddělit scope, jednorázové tajemství, negativní ownership testy |
| Síť výkon | jeden IP request na každou VPS, pouze s concurrency 6 | batch/filter dotaz nebo omezený fallback s request budgetem |
| Síť lazy load | traffic karta se mountuje vždy a okamžitě spustí 6 měsíčních requestů | page-level Adresy / Provoz / Živě a lazy query |
| Síť user live | chybí | polling pouze na aktivní záložce a korektní stop lifecycle |
| Admin network filtry | UI nepředává environment/location u live a environment/location/node u traffic | doplnit filtry, URL persistence a drill-down |
| Účet -> Prostředky | stránka ukazuje jen usage, ne read-only balíčky a konfiguraci prostředí | přidat bez další rychlé správy účtu |
| Build provenance | chybí `build-info.json`/jasné spojení assetů s SHA | generovat manifest a připravit parity gate; bez deploye |

## Pravidla práce

1. Každý den začíná ověřením HEAD, skutečného API kontraktu a capability.
2. Každý den končí dvěma ukazatelnými výsledky nebo jedním velkým workflow a
   prokazatelným hardeningem.
3. Role v UI není bezpečnostní hranice. Používá se capability, scope,
   vlastnictví a serverové 403.
4. První kliknutí na destruktivní akci nic nemění. Dvojité odeslání je
   blokováno a cancel neposílá request.
5. API label/name je primární text; raw enum pouze kontrolovaný fallback.
6. Drahá data se načítají až po otevření relevantní záložky.
7. Testovací data mají unikátní prefix a cleanup v `finally`.
8. Po každém checkpointu: cílené testy, typecheck, vizuální kontrola a CI pro
   přesný SHA.
9. Upstream `vpsfreecz/*` zůstává read-only. Chybějící API se popíše, nikoli
   obchází nepravdivým frontendem.
10. Bez explicitního schválení se nic nenasazuje.

## Denní kapacitní rámec

| Blok | Běžná kapacita | Povinný výstup |
|---|---:|---|
| Audit a kontrakt | 0,5 h | HEAD, capability, payload a hranice scope |
| Hlavní vertikála A | 2,5 h | první viditelný funkční výsledek |
| Navazující vertikála B | 1,5 h | druhý výsledek nebo uzavřený hardening |
| Negativní scénáře | 1,0 h | foreign ID, 403, cancel, retry, double-submit |
| Automatizace | 1,0 h | unit/integration + pojmenované Playwright scénáře |
| Vizuál, dokumentace, commit a CI | 1,0 h | desktop/mobil, stručný kontrakt, SHA a CI URL |

Celkem je naplánováno přibližně **75 hodin**. Víkendové kontrolní body jsou
volitelné a neobsahují implementaci.

## Roadmapa: každý den dva prokazatelné posuny

| Den | Datum | Hlavní výsledek | Druhý viditelný výsledek | Hlavní důkaz |
|---:|---|---|---|---|
| 1 | Čt 30. 7. | Kompletní samoobsluha vlastních subdatasetů | Spolehlivý Praha Production vzorek | 3 vstupy, create/edit/delete + přesných 3+3+3 IP |
| 2 | Pá 31. 7. | Účet -> Prostředky ukáže balíčky/prostředí | Build SHA/parity + incident capability rozhodnutí | profil screenshot + SHA + API důkaz |
| 3 | Po 3. 8. | Admin CVE seznam/detail/editor konceptu | Veřejný detail a privacy redakce | admin/user/support matice |
| 4 | Út 4. 8. | CVE publish/retract/update lifecycle | node readiness, affected objekty a outage vazby | disposable live flow + cleanup |
| 5 | St 5. 8. | Primary/secondary DNS create | Správný landing a secondary server UX | dva payloady + oba cílové detaily |
| 6 | Čt 6. 8. | Skutečný DNS transfer log | server/transfer UX a lokalizované stavy | API model + tabulka/detail E2E |
| 7 | Pá 7. 8. | Bezpečný user/admin TSIG scope | servery zóny podle capability + Network baseline měření | secret/foreign-ID scan + HAR |
| 8 | Po 10. 8. | Síť bez per-VPS N+1 | Adresy/Provoz/Živě + lazy traffic a starší období | request count před/po |
| 9 | Út 11. 8. | User live s korektním start/stop | Admin env/location/node/VPS filtry a drill-down | polling trace + URL persistence |
| 10 | St 12. 8. | Permission/i18n/a11y/security hardening | Plný RC důkaz, dokumentace a jeden SHA/checksum postup | full suite + screenshot galerie |

## Den 1 - Čtvrtek 30. 7.: dokončit samoobsluhu subdatasetů

**Kapacita:** 7,5 h

### Co už dnes opravdu funguje

- V NAS seznamu už běžný uživatel vidí **Přidat subdataset**.
- Route `/app/nas/new` už načte jen jeho možné rodiče a odešle create request.
- Vlastní dataset už může upravovat; pokročilé ZFS vlastnosti jsou skryté.
- Praha Production už se v admin seznamu volných IP řadí před ostatní lokality.

### Co přesně chybí a bude se 30. 7. dělat

- Stejná tvorba subdatasetu přímo z **detailu datasetu** a z **VPS -> Úložiště**.
- Jednotný capability/owner gate místo tří rozdílných podmínek v UI.
- Úprava velikosti a běžných bezpečných vlastností vlastního child datasetu.
- Bezpečné smazání pouze vlastního child datasetu; nikdy rootu nebo cizího ID.
- Busy, API error/retry, double-submit, cancel bez requestu a úklid testovacích dat.
- U IP jen dokončení spolehlivosti: owner filtr, dohledání přes více stránek,
  správná primární lokalita a přesný limit devíti Praha Production adres.

### Večer bude vidět

1. Uživatel zvládne celý životní cyklus vlastního subdatasetu - vytvořit,
   upravit běžná nastavení a bezpečně smazat - ze všech tří přirozených míst:
   NAS, detail datasetu a VPS -> Úložiště.
2. Admin u volných IP spolehlivě uvidí nejvýše 3 veřejné IPv4, 3 privátní IPv4
   a 3 IPv6 z Praha Production před reprezentativním zbytkem lokalit.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-09:30 | potvrdit realitu HEAD | projít existující NAS create a sepsat přesně portované bloky, neimplementovat jej znovu |
| 09:30-11:30 | sjednotit správu subdatasetů | capability/owner gate, CTA z NAS, detailu datasetu i VPS, minimální create a edit běžných vlastností |
| 11:30-12:00 | průchod prvního workflow | create -> otevřít detail -> změnit velikost/nastavení; přesné payloady |
| 13:00-14:30 | delete a bezpečnost | pouze own child, potvrzení dopadu, root/foreign zakázané, cancel 0 requestů |
| 14:30-15:15 | odolnost workflow | busy, error/retry, double-submit a cleanup v `finally` |
| 15:15-16:15 | Praha IP hardening | owner-null, primary-location, keyset scan a přesné 3+3+3 limity |
| 16:15-17:00 | důkaz a kvalita | CS/EN, desktop/mobil, cílené unit/E2E, typecheck, build, screenshoty a CI |

### Definition of Done

- Praha vzorek nepoužije cizí vlastněnou adresu a nepřesáhne 9 řádků.
- Filtr/search/pagination neztratí ani neduplikuje data.
- User vytvoří jen pod vlastním parent datasetem a může upravit jen bezpečná
  běžná pole vlastního child datasetu.
- Delete dialog popíše dopad; cancel má 0 requestů.
- Root ani cizí dataset nemá create/edit/delete akci ani přes přímé ID.
- Advanced ZFS zůstává skryté.
- Všechny tři vstupy vedou ke stejnému formuláři a stejným pravidlům.

**Důkaz dne:** create/edit/delete z NAS, detailu datasetu a VPS, own/root/foreign
matice, error/retry screenshot, IP desktop/mobil, zachycené payloady a CI URL.

### Co se tento den znovu nedělá

- nevyrábí se nový NAS create formulář od nuly,
- nepředělává se celý IP seznam ani jeho filtry,
- nepřidává se další nesouvisející funkce na úkor owner/permission testů.

## Den 2 - Pátek 31. 7.: užitečnější Prostředky + ověřitelný build

**Kapacita:** 7,5 h

**Reuse:** subdatasety jsou uzavřené v Dni 1; profil je hotový, ale záložka
Prostředky ukazuje jen usage a build nemá jednoznačný otisk commitu.

### Večer bude vidět

1. Účet -> Prostředky ukáže read-only balíčky a konfiguraci prostředí vedle
   usage; nevznikne žádná další „rychlá správa účtu“.
2. Build vytvoří jednoduchý manifest s Git SHA pro budoucí parity kontrolu.
3. Incident create bude živě ověřen capability a least-privileged 403; pokud
   zůstane admin-only, vznikne přesné zadání backendové změny místo mrtvého CTA.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-09:45 | Profile Resources kontrakt | zjistit zdroj balíčků/prostředí a přesný user scope |
| 09:45-12:00 | Profile Resources UI | balíčky, prostředí a přidělené kapacity pouze pro čtení; responsive stav |
| 13:00-14:00 | permission a stavy | own/foreign, loading/empty/error/retry, žádná editace |
| 14:00-15:00 | build provenance | generovaný `build-info.json`/ekvivalent se SHA, bez artefaktů a secretů v gitu |
| 15:00-16:00 | incident capability proof | capability dotaz, least-privileged create pokus a přesný blocker/spec |
| 16:00-17:00 | testy a důkaz | profil CS/EN desktop/mobil, SHA parity test, typecheck, build a CI |

### Definition of Done

- Profil zobrazuje jen vlastní read-only balíčky/prostředí.
- Žádný nový management rozcestník ani duplikovaný panel.
- Build manifest nevystavuje secret a jednoznačně odkazuje na commit.
- Incident create se neukáže jako funkční user akce bez serverové capability.

**Důkaz dne:** own/foreign profil trace, Prostředky v obou jazycích a na dvou
šířkách, obsah build manifestu, incident capability/403 capture a CI URL.

## Den 3 - Pondělí 3. 8.: CVE admin základ + veřejný detail

**Kapacita:** 7,5 h

**Reuse:** `deb8b7e` obsahuje rozsáhlou implementaci, ale je to jeden velký
commit nad starším base. Portuje se ručně po doménových blocích.

### Večer bude vidět

1. Oprávněný admin má seznam, filtry, detail a editor konceptu advisory/CVE.
2. Veřejný detail zobrazuje jen publikovatelná pole; draft a interní poznámky
   nejsou dostupné v UI.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:00 | kontrakt a gate | runtime capability probe pro admin/support/user; role-only gate se nepřevezme |
| 10:00-12:00 | API + route + list/detail | normalizované modely, loading/empty/error, lokalizované stavy |
| 13:00-14:30 | editor draftu | validace CVE, create/edit payload, submit lock a retry |
| 14:30-15:15 | veřejný detail | explicitní allowlist polí, draft 404/hidden, odkaz z public listu |
| 15:15-16:15 | negativní matice | user/support direct URL, 403, anonymní payload privacy capture |
| 16:15-17:00 | testy a důkaz | unit/component/E2E, CS/EN, mobil, CI |

### Definition of Done

- Admin vytvoří a znovu otevře draft.
- User/support nevidí route ani nemohou volat mutaci.
- Frontend nevykreslí `note`, `reporter_name` ani jiná interní pole.
- Pokud anonymní API stále posílá citlivá data, vznikne přesný upstream privacy
  blocker; frontendová redakce se neoznačí za backendové zabezpečení.

**Důkaz dne:** admin/user/support screenshot, draft payload, anonymní response
capture se zredigovanými hodnotami a zelené cílené CI.

## Den 4 - Úterý 4. 8.: CVE lifecycle + vztahy a dopad

**Kapacita:** 7,5 h

### Večer bude vidět

1. Advisory lze bezpečně publikovat, aktualizovat, stáhnout a případně znovu
   sestavit; každý přechod jasně ukazuje dopad.
2. Detail ukáže node readiness, dotčené uživatele/VPS a vazby na odstávky bez
   úniku interních údajů.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:30 | lifecycle | publish/retract/update/rebuild capability a potvrzovací dialogy |
| 10:30-12:00 | CVE data | normalize/reconcile, lokalizované stavy, konfliktní odpověď/retry |
| 13:00-14:15 | node readiness | assessment tabulka, relevantní stavy a detail |
| 14:15-15:15 | dopad/vazby | affected users/VPS a outage relation create/remove |
| 15:15-16:00 | live disposable flow | unikátní draft, lifecycle bez mail side-effectu, cleanup v `finally` |
| 16:00-17:00 | mobil, docs a CI | public/admin screenshoty, provozní postup a známé API limity |

### Definition of Done

- První kliknutí na publish/retract pouze otevře kontrolu dopadu.
- Veřejný seznam/detail reaguje přesně podle publish stavu.
- Duplicate relation a konflikt mají čitelnou chybu a retry.
- Disposable live test nezanechá draft, update ani vazbu.

**Důkaz dne:** lifecycle timeline, public before/after, node/outage relation,
cleanup log, test report a CI URL.

## Den 5 - Středa 5. 8.: primary/secondary DNS create

**Kapacita:** 7,5 h

**Reuse:** incident capability je uzavřená v Dni 2. Existující create formulář
však stále předpokládá primary zónu a posílá `source: internal_source`; tento
den dokončí celý rozcestník a workflow pro oba typy zón.

### Večer bude vidět

1. Create DNS zone začíná volbou Primary/Secondary, ukazuje jen relevantní
   pole, posílá správný payload a otevře správnou záložku.
2. Secondary workflow srozumitelně nastaví vlastní servery/peery a po vytvoření
   neukazuje CRUD záznamů určený pro primary zóny.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:00 | kontrakt obou typů | potvrdit type/source enumy, serverová pole, capability a cílové detaily |
| 10:00-11:30 | sdílený create model | explicitní typ zóny, relevantní pole, validace a přesné payloady |
| 11:30-12:00 | primary regrese | běžná primary zóna dál vznikne bez nového klikání a otevře Záznamy |
| 13:00-14:30 | secondary create | vlastní servery/peery, správný source a žádný primary-only record CRUD |
| 14:30-15:15 | landing a server UX | primary -> Záznamy; secondary -> Servery/Transfery s jasným dalším krokem |
| 15:15-16:15 | negativní testy | absence polí v DOM/payloadu, špatný server, API error, retry a double-submit |
| 16:15-17:00 | vizuál a CI | oba create flow desktop/mobil, CS/EN, cílené testy a build |

### Definition of Done

- Primary a secondary mají rozdílný přesný payload.
- Nerelevantní pole nejsou pouze disabled, ale nejsou v DOM ani payloadu.
- Primary workflow nezíská zbytečný krok navíc; secondary po vytvoření ukáže
  serverovou konfiguraci místo nefunkčního editoru záznamů.
- Blank record TTL a současné rozdílné DNS detaily projdou regresí bez přepisu.

**Důkaz dne:** primary/secondary request capture, dva screenshoty formuláře,
oba cílové detailní pohledy, negativní scénáře a CI URL.

## Den 6 - Čtvrtek 6. 8.: skutečný DNS transfer log

**Kapacita:** 7,5 h

**Reuse:** současná Transfers stránka se zachová jako konfigurace peerů;
snapshot `dns_server_zones` se už nebude vydávat za historii přenosů.

### Večer bude vidět

1. Secondary zóna má skutečný log z `dns_server_zone_transfer_log` s časem,
   serverem, stavem, primary, serialem, reason a message.
2. Transfer konfigurace a historie jsou vizuálně i významově oddělené a
   použitelné na desktopu i mobilu.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:00 | API kontrakt | endpoint, includes, cursor/order, lokalizované state/reason labely |
| 10:00-11:30 | klient a model | normalizace, typy, keyset pagination, žádné `any` na nové hranici |
| 11:30-12:00 | model testy | prázdná data, neúplná relace, raw fallback pouze kontrolovaně |
| 13:00-14:30 | tabulka + detail | compact list, expandable detail/message, server a serial |
| 14:30-15:15 | UX stavy | loading skeleton, empty, retry, unavailable a stale stav |
| 15:15-16:15 | E2E | secondary s logem, bez logu, API chyba, primary absence logu |
| 16:15-17:00 | důkaz | desktop/mobil, CS/EN, performance a CI |

### Definition of Done

- Data pocházejí z transfer-log objektu, ne z record transakcí ani snapshotu.
- Primary zóna nedostane nesmyslný secondary log.
- Dlouhá message nerozbije tabulku a interní enum není hlavní text.
- Pokud endpoint/capability chybí, UI ukáže poctivý unavailable stav a vznikne
  přesný API gap, ne falešná historie.

**Důkaz dne:** response fixture, tabulka/detail ve dvou viewporTech, error/empty
scénář a CI URL.

## Den 7 - Pátek 7. 8.: TSIG a servery podle skutečného scope

**Kapacita:** 7,5 h

### Večer bude vidět

1. User vidí a spravuje pouze své TSIG klíče a servery zóny, pokud to API
   capability dovoluje; admin scope zůstává oddělený.
2. Tajná hodnota se ukáže nejvýše jednou po vytvoření a neuniká do listu,
   URL, toastu, logu ani screenshotů.
3. Je uložen request-count/HAR baseline uživatelské Sítě pro pondělní výkon.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:00 | scope audit | TSIG/server capabilities, user filter, foreign direct-ID a 403 |
| 10:00-11:30 | user/admin split | bez arbitrary `UserLookupInput` v user scope, oddělené route a query key |
| 11:30-12:00 | secret lifecycle | jednorázový reveal/copy, po zavření již nerehydratovat |
| 13:00-14:15 | server assignment | capability-based create/delete, potvrzení a správné peer typy |
| 14:15-15:15 | negativní testy | cizí klíč/server, list redaction, cancel, retry, double-submit |
| 15:15-16:00 | secret scan | DOM, trace, console, URL a toast bez secretu |
| 16:00-17:00 | Network baseline + CI | počet IP/traffic requestů, TTF-content, screenshot a checkpoint |

### Definition of Done

- User query není globální `fetchDnsTsigKeys({ limit: 200 })` bez scope.
- Cizí object ID nevede k detailu ani mutaci.
- Delete má potvrzení; cancel má 0 requestů.
- Chybějící serverová capability vede k read-only/skrytému stavu a API gapu.

**Důkaz dne:** user/admin/foreign matice, jednorázový secret dialog, secret
scan, Network HAR baseline a CI URL.

## Den 8 - Pondělí 10. 8.: Síť bez N+1 a s lazy záložkami

**Kapacita:** 7,5 h

**Reuse:** existující velký graf a vnitřní Přehled/Rozpad se zachovají; cílem
není další redesign grafu.

### Večer bude vidět

1. Adresy jsou lehký výchozí obsah bez jednoho IP requestu na každou VPS.
2. Page-level Adresy / Provoz / Živě jasně oddělí úkoly; při otevření Adres je
   počet traffic/live requestů přesně nula.
3. Provoz se načte až po kliknutí a nabídne starší období uvnitř stejné
   záložky.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:00 | měření a kontrakt | request graph před změnou, batch/filter capability, budget |
| 10:00-12:00 | adresy | jeden filtrovaný/batch dotaz nebo dokumentovaný bounded fallback |
| 13:00-14:00 | page tabs | URL-stabilní Adresy/Provoz/Živě, klávesnice a mobil |
| 14:00-14:45 | lazy Provoz | query `enabled` pouze na aktivní záložce, skeleton/error/retry |
| 14:45-15:30 | období | současných 6 měsíců rychle, starší/custom interval až po volbě |
| 15:30-16:15 | performance E2E | request count nezávislý na počtu VPS, 0 traffic na Adresách |
| 16:15-17:00 | before/after důkaz | HAR, TTF-content, desktop/mobil, CI |

### Definition of Done

- Primární cesta nemá per-VPS N+1; pokud API batch chybí, fallback má pevný
  budget a je přesně zdokumentovaný.
- Traffic requesty nezačnou před otevřením Provozu.
- Existující graf nepřeteče na mobilu a zachová Overview/Breakdown.
- Scope vlastních/přiřazených IP a lokalitní kompatibilita mají regresní test.

**Důkaz dne:** request diagram a počet před/po, taby v obou viewporTech,
zero-request assertion a CI URL.

## Den 9 - Úterý 11. 8.: user live + admin network drill-down

**Kapacita:** 7,5 h

### Večer bude vidět

1. User Live začne aktualizovat až po otevření, při skrytí/opuštění zastaví
   polling a po návratu se korektně obnoví.
2. Admin live/traffic UI využije už existující API parametry pro environment,
   location, node a VPS; filtry zůstávají v URL a řádek vede na relevantní
   detail.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:00 | user live kontrakt | vlastní interface/VPS scope, refresh cadence a unavailable stav |
| 10:00-11:30 | polling lifecycle | aktivní tab + visibility/focus, stop při unmount/tab switch |
| 11:30-12:00 | reconnect | offline/error/backoff/retry bez request stormu |
| 13:00-14:15 | admin filtry | environment/location/node/VPS, query params a clear filters |
| 14:15-15:00 | drill-down | zachovat filtr při návratu, odkazy VPS/interface/user detail |
| 15:00-16:00 | E2E časování | fake timer/start-stop, user foreign data, admin payloady |
| 16:00-17:00 | mobil, docs a CI | ovládání tabů/filtrů, trace, screenshoty a provozní limit |

### Definition of Done

- Neaktivní Live má 0 requestů a po odchodu nepřibývají další.
- User nevidí cizí interface ani VPS.
- Admin filtry se propíší do přesného requestu a jsou sdílené odkazem.
- Nedostupný monitor ukáže vysvětlení a retry, ne nekonečný spinner.

**Důkaz dne:** polling timeline, request payloady filtrů, URL persistence,
desktop/mobil screenshoty a CI URL.

## Den 10 - Středa 12. 8.: hardening napříč UI + release candidate

**Kapacita:** 7,5 h

**Pravidlo:** žádná nová velká feature. Celý den je aktivní práce na důkazech,
opravách nalezených regresí a dohledatelnosti releasu.

### Večer bude vidět

1. Jeden build má permission, i18n, a11y, mobile a security důkaz pro všechny
   změněné sekce.
2. Existuje přehledný release report, screenshot galerie a jednoznačný SHA /
   checksum postup pro oba weby po budoucím explicitním schválení.

### Harmonogram

| Čas | Práce | Konkrétní výstup |
|---|---|---|
| 09:00-10:15 | permission matrix | user/support/admin, own/foreign, hidden CTA/direct URL/server 403 |
| 10:15-11:00 | i18n/raw enum | CS/EN klíče, API label/name, dlouhé texty a formát data/času |
| 11:00-12:00 | a11y/mobil | focus trap, taby, modaly, klávesnice, overflow, 375px viewport |
| 13:00-14:00 | security recheck | XSS corpus, TSIG secret, CSP, dependency a mutation audit |
| 14:00-15:15 | plná automatizace | `ci:check`, typecheck, unit, BFF security, build, desktop + mobile E2E |
| 15:15-16:00 | safe live smoke | dev read-only + disposable mutace s cleanupem, pokud jsou credentials |
| 16:00-17:00 | RC balík | opravy nálezů, galerie, docs, release notes, SHA/checksum gate a CI |

### Definition of Done

- Neexistuje známý UI privilege leak; mock E2E je odlišené od server auth
  důkazu.
- Všechny povinné testy jsou zelené nebo je blocker explicitní a release je
  označen NO-GO.
- Worktree neobsahuje `dist`, `assets`, `.vite`, `node_modules`, secret ani
  testovací auth soubor.
- Dokumentace uvádí hotovo, vědomě odložené body, API gapy a další konkrétní
  krok.
- Deploy není součástí dne; následuje až po explicitním schválení.

**Důkaz dne:** permission matrix, full report, screenshot galerie, live cleanup
log, GitHub CI URL, Git SHA a checksum procedura.

## Povinná testovací matice

| Oblast | Pozitivní scénář | Negativní scénář | Live důkaz | Vizuál |
|---|---|---|---|---|
| Praha IP | přesný 3+3+3 vzorek | owned/missing metadata, pagination | read-only list | desktop + mobil |
| Subdatasety | own create/delete | foreign ID, cancel, busy, double-submit | least-privileged + cleanup | oba vstupy + confirm |
| CVE | draft/lifecycle/public | user/support forbidden, privacy, conflict | disposable draft + cleanup | admin + public + mobil |
| Incident | index/show own | create 403 podle capability | response capture bez dat | skryté CTA + spec |
| DNS create | primary + secondary | absence polí, bad server, API error | disposable zone + cleanup | oba typy + landing |
| Transfer log | historie a detail | empty/error/primary absence | read-only secondary | desktop + mobil |
| TSIG/servery | vlastní scope | foreign ID, secret leak, cancel | disposable key jen pokud safe | one-time secret dialog |
| Network addresses | batch/filter list | N+1 budget, foreign IP | HAR/request count | desktop + mobil |
| Network traffic/live | lazy/history/start-stop | inactive zero requests, unavailable | polling trace | taby + filtry |
| Release | full critical paths | different SHA/red CI | safe live smoke | screenshot gallery |

## Volitelné víkendové kontroly

- **So 1. 8. / 15 min:** projít IP + subdataset galerii; nejvýše tři konkrétní
  připomínky, žádná implementace.
- **Ne 2. 8. / 10 min:** potvrdit CVE akceptační kritéria a privacy otázky.
- **So 8. 8. / 30 min:** UAT CVE, secondary DNS a transfer log; jeden dobrý a
  jeden problematický průchod.
- **Ne 9. 8. / 15 min:** zamknout Network/RC scope a rozdělit blocker vs.
  odložitelnou drobnost.

## Rozhodovací brány a pořadí škrtání

1. Bez capability nebo serverového 403/2xx důkazu není mutační CTA.
2. Bez bezpečného TSIG kontraktu zůstane user správa read-only/skrytá.
3. Bez batch IP API se zachová pevný request budget a zapíše backend úkol.
4. Při skluzu se škrtají v tomto pořadí: CVE outage vztahy, TSIG server mutace,
   admin traffic drill-down. Neškrtají se permission testy, secret scan,
   cleanup, CS/EN ani základní mobilní průchod.
5. Červené CI nebo rozdílný SHA/checksum znamená NO-GO.
6. Bez explicitního lidského souhlasu se nenasazuje.

## Denní report

Každý den se zapíše:

- viditelný výsledek A,
- viditelný výsledek B,
- commit(y) a přesný SHA,
- cílené testy a GitHub CI URL,
- desktop/mobil screenshot nebo měření,
- live ověření vs. pouze mockované ověření,
- nalezený blocker a rozhodnutí,
- první konkrétní krok dalšího dne.

## Finální cíl 12. 8. 2026

Výsledkem není počet nových obrazovek. Výsledkem je jeden přehledný, bezpečný
a dohledatelný release candidate, ve kterém:

- jsou integrované již napsané IP, subdataset a CVE změny bez ztráty novějšího
  security cleanupu,
- secondary DNS a transfery odpovídají skutečnému modelu,
- TSIG scope a secret lifecycle jsou bezpečné,
- Síť neblokuje adresy drahými dotazy a live polling se chová předvídatelně,
- incidentní limit je poctivě popsán jako API blocker,
- každý hlavní výsledek má test, screenshot nebo request trace,
- jeden Git SHA lze po schválení prokázat na obou cílových webech.
