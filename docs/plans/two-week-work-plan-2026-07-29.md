# vpsAdmin WebUI Next: pracovní plán na dva týdny

Období: **29. 7. - 7. 8. 2026**  
Rozsah: zbývající tři pracovní dny tohoto týdne a pět pracovních dnů
příštího týdne.

## Cíl po dvou týdnech

Mít jeden dohledatelný release, který je stejný v gitu, na
`clankerdev.vpsfree.cz` i na `dev.crucio.cz`, a současně uzavřít nejdůležitější
uživatelská workflow bez dalšího rozšiřování navigace nebo kosmetických
odboček.

Konkrétní výsledek:

1. jeden kanonický commit a release manifest pro oba weby,
2. integrovaná a ověřená správa bezpečnostních upozornění/CVE,
3. funkční subdatasety a hlášení incidentu v uživatelském pohledu,
4. správné rozlišení primárních a sekundárních DNS zón,
5. rychlejší stránka Síť bez N+1 načítání,
6. permission matrix, zelené CI a živý Playwright smoke test.

## Proč právě toto pořadí

Aktuální stav není jeden celek. `origin/main` je na `6f6dcef`, nasazená změna
seskupení lokalit je na `d600b92` a samostatně existují zelené větve pro správu
bezpečnostních upozornění (`deb8b7e`), subdatasetové E2E testy (`fb211f9`) a
pražské produkční IP (`e5abd0b`). Dokud se tyto proudy nespojí do jednoho
releasu, další práce zvyšuje riziko, že se část opravy při dalším nasazení
ztratí.

Proto je priorita tohoto týdne nejdřív **sjednotit zdroj pravdy**, potom
integrovat hotové změny a až následně rozšiřovat další workflow.

## Harmonogram

| Den | Hlavní fokus | Konkrétní výstup | Definition of Done |
|---|---|---|---|
| St 29. 7. | Release baseline | Integrační větev, inventura commitů, release manifest | Je jasné, co je v main, v releasu a na obou webech |
| Čt 30. 7. | Menší hotové proudy | Cluster groups, pražské IP, subdatasety | Konflikty vyřešené, cílené testy a build zelené |
| Pá 31. 7. | Správa CVE | Admin CRUD, publish/retract, vztahy k nodům a odstávkám | Capability gate, mutation audit, E2E a dokumentace |
| Po 3. 8. | User workflow | Subdataset create/delete a incident report | Jen vlastní objekty, přesné payloady, error/retry scénáře |
| Út 4. 8. | DNS - model | Primární/sekundární create flow a správná pole | Žádné nevhodné `internal_source`, capability-based UI |
| St 5. 8. | DNS - provoz | Skutečný transfer log, TSIG a servery zóny | Žádné úniky secretů, správná user/admin oprávnění |
| Čt 6. 8. | Síť | Měření, odstranění N+1, lazy záložky | Méně requestů, rychlý první obsah, polling jen při aktivitě |
| Pá 7. 8. | Hardening a release | Permission matrix, live Playwright, stejný release na obou webech | CI green, shodný SHA/checksum, krátký release report |

## Tento týden: 29. - 31. 7.

### Středa: vytvořit jeden zdroj pravdy

- Založit integrační větev z aktuálního releasu.
- Sepsat přesný seznam commitů, které jsou v main, na obou webech a v
  rozpracovaných větvích.
- Přidat strojově čitelný build/release identifikátor se SHA commitu.
- Připravit kontrolu, že oba webrooty mají stejný build checksum.
- Nezačínat žádnou další feature, dokud není baseline reprodukovatelná.

### Čtvrtek: integrovat malé a ověřené změny

- Seskládat změny seskupení lokalit, pražských produkčních IP a subdatasetů.
- U subdatasetů ověřit create, cancel, delete, chybu a retry, busy stav,
  vlastnictví a přesný payload.
- Pokročilé ZFS vlastnosti ponechat schované v běžném user pohledu.
- Spustit typecheck, unit testy, build a cílený Playwright desktop/mobile.

### Pátek: bezpečnostní upozornění/CVE

- Integrovat existující větev po ověřitelných blocích, ne jako slepý merge.
- Ověřit capability gate pro seznam, detail a všechny mutace.
- Otestovat create/update/publish/retract a vazby na nody a odstávky.
- Zkontrolovat lokalizaci a bezpečné zacházení s chybami a duplicitním
  odesláním.
- Aktualizovat projektovou dokumentaci podle skutečně vydané podoby.

## Příští týden: 3. - 7. 8.

### Pondělí: uzavřít uživatelská workflow

- Dokončit reálný smoke subdatasetů proti `dev.crucio.cz`.
- Ověřit založení incidentu ze seznamu i z detailu VPS.
- V nabídce zobrazit jen vlastní VPS; cizí ID nesmí projít ani přímou URL.
- Pokrýt validaci, serverovou chybu, retry a ochranu proti double submitu.

### Úterý a středa: DNS bez slepých míst

- V prvním kroku rozlišit primární a sekundární zónu.
- Pro každý typ zobrazit a odeslat jen relevantní pole.
- U sekundární zóny použít skutečný `dns_server_zone_transfer_log`, nikoli log
  změn záznamů.
- Dokončit user-scoped TSIG a správu serverů zóny podle capability API.
- Nikdy nezobrazit ani nelogovat hodnotu TSIG secretu.

### Čtvrtek: zrychlit a zjednodušit Síť

- Nejdřív změřit počet requestů a čas do prvního obsahu.
- Nahradit per-VPS IP dotazy jedním filtrovaným/batch dotazem.
- Adresy, Provoz a Živě načítat až po otevření příslušné záložky.
- Polling spouštět jen na aktivní živé záložce a po opuštění jej zastavit.
- Ověřit administrátorské filtry a mobilní zobrazení.

### Pátek: permission matrix a vydání

- Projít user/admin oprávnění všech změněných sekcí.
- U mutací ověřit preflight, lokální zámek, action state a refetch.
- Spustit plný Playwright smoke proti `dev.crucio.cz` v desktopu i mobilu.
- Zkontrolovat GitHub CI a nasadit pouze identický commit na oba weby.
- Ověřit SHA i checksum a přidat krátký release report.

## Rozdělení kapacity

### Tento týden

- 35 % release baseline a integrace,
- 25 % subdatasety, pražské IP a cluster groups,
- 35 % správa bezpečnostních upozornění,
- 5 % rezerva na konflikty a live smoke.

### Příští týden

- 20 % incidenty a uzavření user workflow,
- 30 % DNS,
- 25 % výkon a UX stránky Síť,
- 20 % permissions, CI a release parity,
- 5 % rezerva.

## Definition of Done pro každý pracovní proud

Práce není hotová pouze tím, že stránka vypadá správně.

- Funkce je dostupná jen rolím a vlastníkům, kterým ji dovoluje API.
- UI používá lokalizované popisky a neukazuje interní hodnoty API.
- Mutace má kontrolovaný payload, zámek proti dvojkliku a srozumitelnou chybu.
- Existuje alespoň unit test nebo cílený Playwright scénář.
- Změna projde typecheckem, testy a buildem.
- Kritický tok je ověřen živě na `dev.crucio.cz`.
- GitHub CI je zelené.
- U releasu je prokazatelné, že oba weby běží ze stejného commitu.

## Co během těchto dvou týdnů vědomě neřešit

- další redesign dashboardu a veřejného statusu,
- obecný redesign navigace,
- nové informační karty bez přímé vazby na workflow,
- kosmetické úpravy, které nemají měřitelný dopad na dokončení úkolu,
- registrace a jejich schvalování, dokud se tato oblast znovu explicitně
  nezařadí do rozsahu,
- globální platby, node create/edit a další parity backlog, pokud neblokují
  plánovaný release.

## Rozhodnutí pro další plánování

Na konci pátku 7. 8. udělat krátké rozhodnutí podle důkazů, ne podle dojmu:

1. Pokud je DNS kontrakt kompletní, pokračovat globálními platbami a node
   storage/maintenance paritou.
2. Pokud API některou DNS nebo síťovou operaci nepodporuje, zapsat konkrétní
   API gap; nevyrábět falešný frontend.
3. Pokud se stále rozcházejí verze nasazení, zastavit nové features a dokončit
   automatický release gate.

