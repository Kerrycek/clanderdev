export type VpsMutationSnapshot = Readonly<{
  vpsId: number;
  canMutate: boolean;
  knownBusy: boolean;
  objectLabel: string;
}>;

/** Freeze the route and preflight values before an awaited durable onMutate. */
export function freezeVpsMutationSnapshot<T extends VpsMutationSnapshot>(snapshot: T): Readonly<T> {
  return Object.freeze({ ...snapshot });
}
