function clusterLocationOrder(label: string): number {
  const normalized = label.trim().toLocaleLowerCase('cs-CZ');
  if (normalized === 'praha' || normalized === 'prague') return 0;
  if (normalized === 'brno') return 1;
  if (normalized === 'playground') return 2;
  if (normalized === 'praha storage' || normalized === 'prague storage') return 3;
  if (normalized === 'staging') return 4;
  return 100;
}

export function compareClusterLocationLabels(a: string, b: string): number {
  const order = clusterLocationOrder(a) - clusterLocationOrder(b);
  return order !== 0 ? order : a.localeCompare(b, 'cs-CZ');
}
