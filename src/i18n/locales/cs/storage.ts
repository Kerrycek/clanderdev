// Storage / datasets / exports / NAS
import { csStorageExports } from "./storage/exports";
import { csDatasetExpansion } from './storage/dataset_expansion';
import { csBackups } from './storage/backups';
export const csStorage = {
  ...csBackups,
  "datasets.list.title": "Datasety",
  "datasets.list.description":
    "Procházej storage datasety, snapshoty a downloady.",
  "datasets.list.search.placeholder":
    "Hledat datasety (název, VPS, uživatel, #id)…",
  "nas.list.title": "NAS",
  "nas.list.description":
    "Procházej datasety uživatelů v primary poolu bez filtrů specifických pro VPS.",
  "nas.list.search.placeholder": "Hledat NAS datasety (název, uživatel, #id)…",
  "nas.list.load_error.title": "Nepodařilo se načíst NAS datasety",
  "nas.list.empty.title": "Žádné NAS datasety",
  "nas.list.empty.body":
    "Datasety v primary poolu se zde zobrazí, když API vrátí datasety s rolí primary.",
  "datasets.smart.suggest.open_dataset": "Otevřít dataset #{id}",
  "datasets.smart.suggest.open_dataset.secondary": "Přejít na detail datasetu",
  "datasets.smart.suggest.vps_id": "Filtrovat podle ID VPS",
  "datasets.smart.suggest.user_id": "Filtrovat podle ID uživatele",
  "datasets.smart.suggest.search": "Hledat: „{q}“",
  "datasets.smart.suggest.search.secondary": "Plnotextové vyhledávání",
  "datasets.smart_help.title": "Filtry datasetů",
  "datasets.smart_help.intro":
    "Použij filtry ve tvaru klíč:hodnota nebo prostý text. Stiskni Enter pro použití nejlepšího návrhu.",
  "datasets.smart_help.items.help": "Zobrazit tuto nápovědu",
  "datasets.smart_help.items.open": "Otevřít dataset #123",
  "datasets.smart_help.items.q":
    "Hledat podle názvu/full name datasetu, hostname VPS nebo uživatele",
  "datasets.smart_help.items.user":
    "Filtrovat podle vlastníka (jen v administraci)",
  "datasets.smart_help.items.vps": "Filtrovat podle ID VPS",
  "datasets.smart_help.items.free":
    "Prostý text se bere jako vyhledávací dotaz",
  "datasets.smart_help.footnote":
    'Tip: hodnoty s mezerami dej do uvozovek, např. q:"foo bar".',
  "datasets.advanced.q.label": "Hledat",
  "datasets.advanced.q.placeholder":
    "Hledat podle datasetu, hostname VPS nebo uživatele",
  "datasets.advanced.user.label": "Vlastník",
  "datasets.advanced.user.placeholder": "Vyber uživatele…",
  "datasets.advanced.vps.label": "VPS",
  "datasets.advanced.vps.placeholder": "Vyber VPS…",
  "datasets.advanced.note":
    "Filtry se ukládají do URL, takže je můžeš sdílet nebo uložit do záložek.",
  "datasets.list.load_error.title": "Nepodařilo se načíst datasety",
  "datasets.list.empty": "Žádné datasety nenalezeny.",
  "datasets.usage.aria_label": "Využití místa datasetu",
  "datasets.usage.no_data": "Žádná data",
  "datasets.usage.used_mib": "{mib} MiB použito",
  "datasets.usage.free_mib": "{mib} MiB volno",
  "dataset.layout.invalid_id": "Neplatné ID datasetu",
  "dataset.layout.load_error.title": "Nepodařilo se načíst dataset",
  "dataset.layout.back_to_list": "Zpět na seznam datasetů",
  "dataset.tabs.overview": "Přehled",
  "dataset.tabs.snapshots": "Snapshoty",
  "dataset.tabs.downloads": "Downloady",
  "dataset.field.name": "Název",
  "dataset.field.pool": "Pool",
  "dataset.field.type": "Typ",
  "dataset.field.state": "Stav",
  "dataset.field.created": "Vytvořeno",
  "dataset.field.updated": "Aktualizováno",
  "dataset.field.usage": "Využití",
  "dataset.field.used": "Použito",
  "dataset.field.available": "Volné",
  "dataset.field.reference_quota": "Referenční kvóta",
  "dataset.field.quota": "Kvóta",
  "dataset.field.referenced": "Odkazováno",
  "dataset.field.children": "Potomci",
  "dataset.field.snapshots": "Snapshoty",
  "dataset.field.mounts": "Mounty",
  "dataset.field.exports": "Exporty",
  "dataset.overview.space.title": "Místo",
  "dataset.overview.space.note": "API reportuje hodnoty v MiB.",
  "dataset.overview.counts.title": "Počty",
  "dataset.overview.details.title": "Podrobnosti",
  "dataset.overview.expansion.title": "Dočasné navýšení",
  "dataset.overview.expansion.subtitle":
    "Přidej datasetu místo na omezenou dobu.",
  "dataset.overview.expansion.subtitle_active":
    "Dataset už má aktivní dočasné navýšení.",
  "dataset.overview.expansion.body":
    "Použij dočasné navýšení, když dataset krátkodobě potřebuje víc místa bez trvalé změny balíčku.",
  "dataset.overview.expansion.create": "Dočasně navýšit",
  "dataset.overview.expansion.open": "Otevřít navýšení",
  "dataset.overview.expansion.active": "Aktivní navýšení",
  "dataset.overview.expansion.none": "Bez navýšení",
  "dataset.overview.actions.title": "Rychlé akce",
  "dataset.overview.actions.snapshots": "Spravovat snapshoty",
  "dataset.overview.actions.downloads": "Snapshot downloady",
  "dataset.overview.actions.open_vps": "Otevřít VPS",
  "dataset.overview.tips.title": "Tipy",
  "dataset.overview.tips.item1":
    "Snapshoty umožní rychlý návrat zpět před rizikovými změnami.",
  "dataset.overview.tips.item2":
    "Použij inkrementální downloady pro efektivní export změn.",
  "dataset.overview.tips.item3":
    "Pokud je akce zablokována, otevři Úlohy a podívej se, co právě běží.",
  "dataset.overview.transactions.title": "Transakce",
  "dataset.overview.transactions.subtitle":
    "Nedávné transakční řetězce týkající se tohoto datasetu.",
  "dataset.overview.transactions.loading": "Načítám transakční řetězce…",
  "dataset.overview.transactions.load_error.title":
    "Nepodařilo se načíst transakční řetězce",
  "dataset.overview.transactions.load_error.body":
    "Nepodařilo se načíst transakční řetězce související s tímto datasetem.",
  "dataset.overview.transactions.empty":
    "Pro tento dataset nebyly nalezeny žádné nedávné transakční řetězce.",
  "dataset.overview.transactions.chains_chip_title":
    "Transakční řetězce týkající se tohoto datasetu",
  "dataset.overview.transactions.chains_chip_label": "Řetězce",
  "dataset.overview.transactions.chain_chip_label": "Řetězec #{id}",
  "dataset.overview.transactions.chain_items_title":
    "Transakční řetězec #{id} · zobrazit jednotlivé transakce",
  "dataset.overview.transactions.chain_items_label": "Položky",
  "dataset.overview.transactions.page_link_label": "Transakční řetězce",
  "dataset.overview.transactions.page_link_title":
    "Otevřít stránku transakčních řetězců",
  "dataset.overview.transactions.chain_failed_row_title":
    "Tento transakční řetězec obsahuje chyby",
  "dataset.manage.title": "Správa datasetu",
  "dataset.manage.subtitle":
    "Uprav velikost a vlastnosti datasetu přímo tady.",
  "dataset.manage.current": "Aktuální dataset: {dataset} (#{id})",
  "dataset.manage.user_limited.title":
    "Běžná správa datasetu",
  "dataset.manage.user_limited.body":
    "Velikost můžeš upravit v rámci dostupných prostředků. Admin má navíc destruktivní akce a možnost přepsat kontrolu kvóty.",
  "dataset.manage.create.open": "Vytvořit subdataset",
  "dataset.manage.create.title": "Vytvořit subdataset",
  "dataset.manage.create.scope":
    "Nadřazený dataset: {dataset}. Nový subdataset se otevře po spuštění akce, pokud API vrátí jeho ID.",
  "dataset.manage.create.error": "Vytvoření datasetu selhalo",
  "dataset.manage.edit.title": "Upravit vlastnosti datasetu",
  "dataset.manage.edit.error": "Úprava datasetu selhala",
  "dataset.manage.delete.title": "Smazat dataset",
  "dataset.manage.delete.description":
    "Smazat {dataset} včetně potomků a snapshotů? Tuto akci nelze vrátit.",
  "dataset.manage.delete.error": "Smazání datasetu selhalo",
  "dataset.manage.validation.title": "Zkontroluj vlastnosti datasetu",
  "dataset.manage.validation.properties":
    "Použij nezáporné hodnoty v GiB a record size mezi 4 a 128 KiB.",
  "dataset.manage.field.child_name": "Název subdatasetu",
  "dataset.manage.field.automount":
    "Automaticky připojit pod rodičovské mounty",
  "dataset.manage.field.quota": "Kvóta (GiB)",
  "dataset.manage.field.refquota": "Referenční kvóta (GiB)",
  "dataset.manage.field.recordsize": "Record size (KiB)",
  "dataset.manage.field.sync": "Sync",
  "dataset.manage.field.compression": "Komprese",
  "dataset.manage.field.atime": "Access time",
  "dataset.manage.field.relatime": "Relative access time",
  "dataset.manage.field.sharenfs": "NFS share",
  "dataset.manage.field.admin_override": "Nastavit bez ohledu na volné prostředky",
  "dataset.manage.field.admin_lock_type": "Typ admin locku",
  "dataset.manage.sync.standard": "Standard",
  "dataset.manage.sync.always": "Vždy",
  "dataset.manage.sync.disabled": "Zakázáno",
  "dataset.manage.admin_lock.no_lock": "Bez locku",
  "dataset.manage.admin_lock.absolute": "Absolutní",
  "dataset.manage.admin_lock.not_less": "Ne méně",
  "dataset.manage.admin_lock.not_more": "Ne více",
  "nas.create.open": "Přidat subdataset",
  "nas.create.title": "Přidat NAS subdataset",
  "nas.create.subtitle": "Vyber rodičovský dataset a nastav vlastnosti nového úložiště.",
  "nas.create.form.title": "Nový subdataset",
  "nas.create.form.subtitle": "Subdataset se vytvoří pod vybraným NAS datasetem.",
  "nas.create.parent": "Rodičovský dataset",
  "nas.create.parent.placeholder": "Vyber rodičovský dataset",
  "nas.create.name": "Název subdatasetu",
  "nas.create.refquota": "Referenční kvóta (GiB)",
  "nas.create.recordsize": "Record size (KiB)",
  "nas.create.automount": "Automaticky připojit pod rodičovské mounty",
  "nas.create.compression": "Komprese",
  "nas.create.atime": "Access time",
  "nas.create.relatime": "Relative access time",
  "nas.create.submit": "Vytvořit subdataset",
  "nas.create.success": "Vytvoření subdatasetu bylo spuštěno",
  "nas.create.error": "Vytvoření subdatasetu selhalo",
  "nas.create.load_error.title": "Nepodařilo se načíst NAS datasety",
  "nas.create.validation.parent": "Vyber rodičovský dataset.",
  "nas.create.validation.name": "Zadej název subdatasetu.",
  "nas.create.validation.properties": "Zadej platnou kvótu a record size mezi 4 a 128 KiB.",
  "nas.create.empty.title": "Nemáš dostupný rodičovský dataset",
  "nas.create.empty.body": "Nejdřív potřebuješ NAS dataset, pod který lze subdataset vytvořit.",
  "dataset.snapshots.title": "Snapshoty",
  "dataset.snapshots.subtitle": "Vytvářej, obnovuj a maž snapshoty datasetu.",
  "dataset.snapshots.search.placeholder":
    "Filtrovat podle názvu, popisku nebo ID snapshotu",
  "dataset.snapshots.load_error.title": "Nepodařilo se načíst snapshoty",
  "dataset.snapshots.empty": "Žádné snapshoty.",
  "dataset.snapshots.created_at": "Vytvořeno {dt}",
  "dataset.snapshots.create.open": "Vytvořit snapshot",
  "dataset.snapshots.create.modal_title": "Vytvořit snapshot",
  "dataset.snapshots.create.help":
    "Vytvoří bodový snapshot tohoto datasetu a při podpoře API spustí sledovatelnou backendovou akci.",
  "dataset.snapshots.create.scope":
    "Cílový dataset: {dataset}. Nový snapshot se po spuštění akce objeví v tomto seznamu.",
  "dataset.snapshots.create.label.placeholder": "např. před-upgradem",
  "dataset.snapshots.create.error.title": "Vytvoření snapshotu selhalo",
  "dataset.snapshots.confirm.rollback.title": "Obnovit snapshot?",
  "dataset.snapshots.confirm.rollback.body":
    "Cílový dataset se vrátí do stavu {snapshot}. Data zapsaná po tomto snapshotu mohou být ztracena.",
  "dataset.snapshots.confirm.rollback.uncertain":
    "Server už mohl tento rollback přijmout. Proběhl pokus o nové načtení stavu, ale další pokus zůstává zablokovaný, dokud nezkontroluješ Úlohy a nevyřešíš uložený bezpečnostní zámek.",
  "dataset.snapshots.confirm.rollback.preflight_failed":
    "Nepodařilo se ověřit aktivní úlohy datasetu. Rollback nebyl odeslán; obnov stránku a zkus to znovu.",
  "dataset.snapshots.rollback_guard.title": "Odemknout místní pojistku rollbacku?",
  "dataset.snapshots.rollback_guard.body":
    "Kontroluješ nejistý rollback na snapshot {label} (ID {id}). Pojistku odemkni až po ověření v Úlohách a datasetu, zda se provedl právě tento rollback.",
  "dataset.snapshots.rollback_guard.risk_title": "Tímto neověřuješ výsledek serveru",
  "dataset.snapshots.rollback_guard.risk_body":
    "Odstraní se pouze místní bezpečnostní zámek v tomto prohlížeči. Serverová operace se nezruší, nezopakuje ani nezmění. Další rollback bez ověření může dataset vrátit znovu.",
  "dataset.snapshots.rollback_guard.unlock": "Odemknout místní pojistku",
  "dataset.snapshots.confirm.delete.title": "Smazat snapshot?",
  "dataset.snapshots.confirm.delete.body":
    "Snapshot {snapshot} bude trvale smazán. Existující odkazy pro stažení z něj mohou přestat fungovat.",
  "dataset.download.modal_title": "Vytvořit snapshot download",
  "dataset.download.modal_help":
    "Vytvořit dočasný odkaz ke stažení pro {snapshot}.",
  "dataset.download.scope":
    "Cílový dataset: {dataset}. Vygenerovaný odkaz se zobrazí na tabu Downloady včetně připravenosti a platnosti.",
  "dataset.download.field.snapshot": "Snímek",
  "dataset.download.snapshot.placeholder": "Vyber snapshot…",
  "dataset.download.snapshot.help": "Potřebuješ starší snapshot? Načti další.",
  "dataset.download.field.format": "Formát",
  "dataset.download.format.archive": "Archiv",
  "dataset.download.format.stream": "Stream",
  "dataset.download.format.incremental_stream": "Inkrementální stream",
  "dataset.download.field.from_snapshot": "Od snapshotu",
  "dataset.download.from_snapshot.none": "Žádný",
  "dataset.download.from_snapshot.help":
    "Volitelný základní snapshot pro inkrementální send.",
  "dataset.download.load_older": "Načíst starší snapshoty",
  "dataset.download.no_more": "Žádné další snapshoty",
  "dataset.download.candidates.error.title":
    "Nepodařilo se načíst kandidátní snapshoty",
  "dataset.download.send_mail.label": "Poslat notifikační e-mail",
  "dataset.download.create.error.title": "Vytvoření downloadu selhalo",
  "dataset.download.create_link": "Vytvořit odkaz",
  "dataset.download.created.title.pending": "Záloha se připravuje ke stažení",
  "dataset.download.created.title.ready": "Záloha je připravená",
  "dataset.download.created.body.pending":
    "Příprava běží na pozadí. Jakmile bude odkaz hotový, pošleme ho e-mailem a uvidíš ho i v sekci Downloady.",
  "dataset.download.created.body.ready":
    "Dočasný odkaz pro stažení snapshotu je připravený. Poslali jsme ho e-mailem a najdeš ho i v sekci Downloady.",
  "dataset.download.created.open_downloads": "Otevřít downloady",
  "dataset.downloads.title": "Downloady",
  "dataset.downloads.subtitle":
    "Vytvářej a spravuj odkazy pro stažení snapshotů.",
  "dataset.downloads.search.placeholder":
    "Filtrovat podle ID snapshotu, formátu, názvu souboru nebo ID downloadu",
  "dataset.downloads.create.open": "Nový download",
  "dataset.downloads.load_error.title":
    "Nepodařilo se načíst snapshot downloady",
  "dataset.downloads.empty": "Žádné downloady.",
  "dataset.downloads.state.ready": "Připraveno",
  "dataset.downloads.state.pending": "Čeká",
  "dataset.downloads.state.expired": "Vypršelo",
  "dataset.downloads.state.failed": "Selhalo",
  "dataset.downloads.state.missing_link": "Chybí odkaz",
  "dataset.downloads.state.unknown": "Neznámé",
  "dataset.downloads.state_detail.ready": "Připraveno ke stažení a kopírování.",
  "dataset.downloads.state_detail.pending":
    "Příprava běží. Jakmile bude odkaz hotový, přijde e-mailem a zobrazí se i v sekci Downloady.",
  "dataset.downloads.state_detail.expired":
    "Vygenerovaný odkaz vypršel. Před sdílením vytvoř nový download.",
  "dataset.downloads.state_detail.failed":
    "Generování selhalo. Opakování vytvoří nový požadavek ze stejného snapshotu.",
  "dataset.downloads.state_detail.missing_link":
    "Backend označil download jako připravený, ale neposlal použitelný odkaz. Zkus opakování nebo obnovení.",
  "dataset.downloads.state_detail.unknown":
    "Backend neposlal jasný stav připravenosti. Před sdílením stránku obnov.",
  "dataset.downloads.item_title": "Stažení #{id}",
  "dataset.downloads.snapshot_ref": "Snímek #{id}",
  "dataset.downloads.from_snapshot_ref": "Od snímku #{id}",
  "dataset.downloads.from_snapshot": "Od {snapshot}",
  "dataset.downloads.expires_at": "Platí do {dt}",
  "dataset.downloads.size": "Velikost {size}",
  "dataset.downloads.table.snapshot": "Snímek",
  "dataset.downloads.table.format": "Formát",
  "dataset.downloads.table.state": "Stav",
  "dataset.downloads.table.expires": "Platnost",
  "dataset.downloads.create.help":
    "Vyber snapshot a formát. API vytvoří dočasný odkaz jako sledovatelnou backendovou akci, pokud ji podporuje.",
  "dataset.downloads.create.scope":
    "Cílový dataset: {dataset}. Připravené odkazy ukazují URL, checksum, velikost a platnost, když je API poskytne.",
  "dataset.downloads.confirm.delete.title": "Smazat download?",
  "dataset.downloads.confirm.delete.body": "Download #{id} bude trvale smazán.",
  "dataset.downloads.review.title": "Kontrola požadavku na download",
  "dataset.downloads.review.intro":
    "Před vytvořením vygenerovaného odkazu zkontroluj zdrojový snapshot a životní cyklus.",
  "dataset.downloads.validation.from_snapshot.title":
    "Zkontroluj základní snapshot inkrementu",
  "dataset.downloads.validation.from_snapshot.body":
    "Základní snapshot musí být starší než cílový snapshot pro inkrementální stream.",
  "dataset.downloads.review.temporary":
    "Vygenerované odkazy jsou dočasné a ber je jako krátkodobé artefakty.",
  "dataset.downloads.review.readiness":
    "Vytvoření může spustit akci na pozadí; před sdílením počkej, až bude odkaz připravený.",
  "dataset.downloads.review.incremental":
    "Inkrementální stream vyžaduje, aby oba snapshoty zůstaly dostupné do spotřebování downloadu.",
  "dataset.downloads.review.full":
    "Plný export nepotřebuje základní snapshot, ale může být větší.",
  "dataset.downloads.confirm.delete.review.title": "Kontrola mazání",
  "dataset.downloads.confirm.delete.review.body":
    "Smazání vygenerovaného odkazu odstraní jen tento download artefakt. Snapshot se nesmaže.",
  "dataset.tabs.exports": "Exporty",
  ...csStorageExports,
  "dataset.tabs.plans": "Plány",
  "dataset.tabs.expansion": "Dočasné navýšení",
  "dataset.plans.title": "Plány datasetu",
  "dataset.plans.subtitle":
    "Přiřaď tomuto datasetu environmentální plány datasetů.",
  "dataset.plans.assigned_count": "Přiřazené plány",
  "dataset.plans.available_count": "Dostupné k přiřazení",
  "dataset.plans.environment": "Prostředí",
  "dataset.plans.load_error.title": "Nepodařilo se načíst plány datasetu",
  "dataset.plans.empty.title": "Dataset nemá přiřazené žádné plány",
  "dataset.plans.empty.body":
    "Přiřaď dostupný plán pro automatizaci snapshotů nebo dalších akcí nad datasetem.",
  "dataset.plans.empty.no_available":
    "Pro tento dataset nejsou dostupné žádné přiřaditelné environmentální plány.",
  "dataset.plans.busy.title": "Dataset je zaneprázdněný",
  "dataset.plans.busy.body":
    "Před změnou přiřazených plánů počkej na dokončení aktuální akce nad datasetem.",
  "dataset.plans.environment_missing.title": "Prostředí není dostupné",
  "dataset.plans.environment_missing.body":
    "Tento dataset momentálně nevystavuje své prostředí, takže nelze vypsat dostupné plány.",
  "dataset.plans.available_load_error.title":
    "Nepodařilo se načíst dostupné plány",
  "dataset.plans.available_load_error.body":
    "Přiřazené plány jsou zobrazeny, ale seznam dostupných environmentálních plánů se nepodařilo načíst.",
  "dataset.plans.column.label": "Štítek plánu",
  "dataset.plans.column.source": "Zdrojový plán",
  "dataset.plans.column.permissions": "Oprávnění uživatele",
  "dataset.plans.permission.user_add": "Uživatel může přidat",
  "dataset.plans.permission.user_add_off": "Uživatel nemůže přidat",
  "dataset.plans.permission.user_remove": "Uživatel může odebrat",
  "dataset.plans.permission.user_remove_off": "Uživatel nemůže odebrat",
  "dataset.plans.assign.open": "Přiřadit plán",
  "dataset.plans.assign.title": "Přiřadit plán datasetu",
  "dataset.plans.assign.field": "Environmentální plán datasetu",
  "dataset.plans.assign.placeholder": "Vyber plán…",
  "dataset.plans.assign.submit": "Přiřadit",
  "dataset.plans.assign.success": "Plán datasetu byl přiřazen",
  "dataset.plans.assign.error": "Plán datasetu se nepodařilo přiřadit",
  "dataset.plans.remove.title": "Odebrat plán datasetu?",
  "dataset.plans.remove.body": "Tímto odstraníš {label} z datasetu.",
  "dataset.plans.remove.success": "Plán datasetu byl odebrán",
  "dataset.plans.remove.error": "Plán datasetu se nepodařilo odebrat",
  "dataset.plans.remove.not_allowed": "Odebrání omezeno",
  ...csDatasetExpansion,
} as const;
