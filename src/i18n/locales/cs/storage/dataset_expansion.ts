// Dataset temporary expansion
export const csDatasetExpansion = {
  'dataset.expansion.title': 'Dočasné navýšení kvóty',
  'dataset.expansion.subtitle':
    'Sleduj přidanou kvótu, ochranné mechanismy a historii rozšíření tohoto datasetu.',
  'dataset.expansion.load_error.title':
    'Dočasné rozšíření datasetu se nepodařilo načíst',
  'dataset.expansion.busy.title': 'Dataset je zaneprázdněný',
  'dataset.expansion.busy.body':
    'Před změnou nastavení rozšíření počkej na dokončení aktuální akce nad datasetem.',
  'dataset.expansion.state.active': 'Aktivní',
  'dataset.expansion.state.resolved': 'Vyřešeno',
  'dataset.expansion.field.added_space': 'Přidané místo',
  'dataset.expansion.field.original_refquota': 'Původní refquota',
  'dataset.expansion.field.current_refquota': 'Aktuální refquota',
  'dataset.expansion.field.created': 'Vytvořeno',
  'dataset.expansion.field.notify': 'Notifikace',
  'dataset.expansion.field.auto_shrink': 'Automatické zmenšení',
  'dataset.expansion.field.stop_vps': 'Zastavit VPS',
  'dataset.expansion.field.max_over': 'Max. doba nad kvótou',
  'dataset.expansion.field.over_quota': 'Nad kvótou zatím',
  'dataset.expansion.empty.title': 'Žádné dočasné rozšíření',
  'dataset.expansion.empty.body_admin':
    'Vytvoř nebo zaregistruj dočasné rozšíření pro tento dataset.',
  'dataset.expansion.empty.body_user':
    'Tento dataset momentálně nemá dočasné rozšíření.',
  'dataset.expansion.create.open': 'Vytvořit rozšíření',
  'dataset.expansion.register.open': 'Zaregistrovat již rozšířený dataset',
  'dataset.expansion.create.title': 'Vytvořit dočasné rozšíření',
  'dataset.expansion.create.inline_subtitle':
    'Přidej prostor na omezenou dobu a nastav, co má systém udělat po jejím uplynutí.',
  'dataset.expansion.register.title': 'Zaregistrovat již rozšířený dataset',
  'dataset.expansion.create.submit': 'Vytvořit rozšíření',
  'dataset.expansion.register.submit': 'Zaregistrovat rozšíření',
  'dataset.expansion.create.success': 'Změna rozšíření datasetu byla spuštěna',
  'dataset.expansion.create.error': 'Změnu rozšíření datasetu se nepodařilo spustit',
  'dataset.expansion.edit.title': 'Upravit nastavení rozšíření',
  'dataset.expansion.update.success': 'Rozšíření datasetu bylo upraveno',
  'dataset.expansion.update.error': 'Rozšíření datasetu se nepodařilo upravit',
  'dataset.expansion.add_space.open': 'Přidat místo',
  'dataset.expansion.add_space.title': 'Přidat další místo',
  'dataset.expansion.add_space.submit': 'Přidat místo',
  'dataset.expansion.add_space.success': 'Další změna prostoru datasetu byla spuštěna',
  'dataset.expansion.add_space.error': 'Nepodařilo se přidat prostor datasetu',
  'dataset.expansion.add_space.warning_title': 'Další krok rozšíření',
  'dataset.expansion.add_space.warning_body':
    'Přidání dalšího místa vytvoří další položku historie rozšíření a může vyvolat návazné akce nad VPS.',
  'dataset.expansion.form.added_space': 'Přidané místo (GiB)',
  'dataset.expansion.form.added_space_hint': 'Zadej množství dalšího místa v GiB.',
  'dataset.expansion.form.original_refquota': 'Původní refquota (GiB)',
  'dataset.expansion.form.original_refquota_hint':
    'Zadej refquotu před rozšířením datasetu. Aktuální refquota: {current}.',
  'dataset.expansion.form.max_over': 'Maximální počet dní překročení kvóty',
  'dataset.expansion.form.max_over_hint':
    'Po uplynutí této doby může systém dataset zmenšit a podle volby zastavit VPS.',
  'dataset.expansion.form.enable_notifications': 'Posílat oznamovací e-maily',
  'dataset.expansion.form.enable_shrink':
    'Povolit automatické zmenšení, pokud je to možné',
  'dataset.expansion.form.stop_vps': 'Zastavit VPS při překročení limitů nad kvótou',
  'dataset.expansion.validation.added_space':
    'Přidané místo musí být kladný počet GiB.',
  'dataset.expansion.validation.original_refquota':
    'Původní refquota musí být kladný počet GiB.',
  'dataset.expansion.validation.max_days':
    'Maximální doba nad kvótou musí být kladný počet dní.',
  'dataset.expansion.history.load_error.title':
    'Historii rozšíření se nepodařilo načíst',
  'dataset.expansion.history.empty.title': 'Zatím žádná historie rozšíření',
  'dataset.expansion.history.empty.body':
    'Pro toto rozšíření datasetu nejsou k dispozici žádné položky historie.',
  'dataset.expansion.history.new_refquota': 'Nová refquota',
  'dataset.expansion.resolved.title': 'Rozšíření je vyřešeno',
  'dataset.expansion.resolved.body':
    'Toto rozšíření již není aktivní. Níže si stále můžeš prohlédnout jeho historii.',
  'dataset.expansion.internal_missing_id': 'Chybí id rozšíření datasetu.',
} as const;
