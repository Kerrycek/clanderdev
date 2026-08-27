// Dataset temporary expansion
export const enDatasetExpansion = {
  'dataset.expansion.title': 'Temporary quota increase',
  'dataset.expansion.subtitle':
    'Track added quota, safeguards and expansion history for this dataset.',
  'dataset.expansion.load_error.title': 'Failed to load dataset expansion',
  'dataset.expansion.busy.title': 'Dataset is busy',
  'dataset.expansion.busy.body':
    'Wait until the current dataset action finishes before changing expansion settings.',
  'dataset.expansion.state.active': 'Active',
  'dataset.expansion.state.resolved': 'Resolved',
  'dataset.expansion.field.added_space': 'Added space',
  'dataset.expansion.field.original_refquota': 'Original refquota',
  'dataset.expansion.field.current_refquota': 'Current refquota',
  'dataset.expansion.field.created': 'Created',
  'dataset.expansion.field.notify': 'Notifications',
  'dataset.expansion.field.auto_shrink': 'Auto-shrink',
  'dataset.expansion.field.stop_vps': 'Stop VPS',
  'dataset.expansion.field.max_over': 'Max over-quota time',
  'dataset.expansion.field.over_quota': 'Over-quota so far',
  'dataset.expansion.empty.title': 'No temporary expansion',
  'dataset.expansion.empty.body_admin':
    'Create or register a temporary expansion for this dataset.',
  'dataset.expansion.empty.body_user':
    'This dataset does not currently have a temporary expansion.',
  'dataset.expansion.create.open': 'Create expansion',
  'dataset.expansion.register.open': 'Register expanded dataset',
  'dataset.expansion.create.title': 'Create temporary expansion',
  'dataset.expansion.create.inline_subtitle':
    'Add space for a limited period and decide what happens after it ends.',
  'dataset.expansion.register.title': 'Register already expanded dataset',
  'dataset.expansion.create.submit': 'Create expansion',
  'dataset.expansion.register.submit': 'Register expansion',
  'dataset.expansion.create.success': 'Dataset expansion change started',
  'dataset.expansion.create.error': 'Failed to start dataset expansion change',
  'dataset.expansion.edit.title': 'Edit expansion settings',
  'dataset.expansion.update.success': 'Dataset expansion updated',
  'dataset.expansion.update.error': 'Failed to update dataset expansion',
  'dataset.expansion.add_space.open': 'Add space',
  'dataset.expansion.add_space.title': 'Add more space',
  'dataset.expansion.add_space.submit': 'Add space',
  'dataset.expansion.add_space.success': 'Additional dataset space change started',
  'dataset.expansion.add_space.error': 'Failed to add dataset space',
  'dataset.expansion.add_space.warning_title': 'Another expansion step',
  'dataset.expansion.add_space.warning_body':
    'Adding more space creates another expansion history item and may trigger VPS-side follow-up actions.',
  'dataset.expansion.form.added_space': 'Added space (GiB)',
  'dataset.expansion.form.added_space_hint':
    'Enter the amount of additional space in GiB.',
  'dataset.expansion.form.original_refquota': 'Original refquota (GiB)',
  'dataset.expansion.form.original_refquota_hint':
    'Enter the refquota before the dataset was expanded. Current refquota: {current}.',
  'dataset.expansion.form.max_over': 'Max over-quota time (days)',
  'dataset.expansion.form.max_over_hint':
    'Leave empty to let the backend use its default policy.',
  'dataset.expansion.form.enable_notifications': 'Send notification emails',
  'dataset.expansion.form.enable_shrink': 'Allow automatic shrink when possible',
  'dataset.expansion.form.stop_vps': 'Stop VPS when over-quota limits are exceeded',
  'dataset.expansion.validation.added_space':
    'Added space must be a positive number of GiB.',
  'dataset.expansion.validation.original_refquota':
    'Original refquota must be a positive number of GiB.',
  'dataset.expansion.validation.max_days':
    'Max over-quota time must be a positive number of days.',
  'dataset.expansion.history.load_error.title': 'Failed to load expansion history',
  'dataset.expansion.history.empty.title': 'No expansion history yet',
  'dataset.expansion.history.empty.body':
    'No history entries are available for this dataset expansion.',
  'dataset.expansion.history.new_refquota': 'New refquota',
  'dataset.expansion.resolved.title': 'Expansion is resolved',
  'dataset.expansion.resolved.body':
    'This expansion is no longer active. You can still review its history below.',
  'dataset.expansion.internal_missing_id': 'Dataset expansion id is missing.',
} as const;
