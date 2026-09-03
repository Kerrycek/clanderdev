import type { ObjectRef } from '../../../lib/objectRef';
import { preflightVpsNotBusy } from './vpsPreflight';

type PreparedPayload<TPayload> =
  | Readonly<{ ok: true; value: TPayload }>
  | Readonly<{ ok: false; error: unknown }>;

export type LifecycleMutationVariables<TPayload> = Readonly<{
  vpsId: number;
  lockRef: ObjectRef;
  basePath: string;
  objectLabel: string;
  canMutateVps: boolean;
  knownBusy: boolean;
  permissionError: string;
  busyError: string;
  refreshVps: () => void;
  refreshChains: () => void;
  preparedPayload: PreparedPayload<TPayload>;
}>;

type LifecycleMutationSnapshotInput = Omit<
  LifecycleMutationVariables<never>,
  'lockRef' | 'preparedPayload'
> & { lockRef: ObjectRef };

function freezePayload<TPayload>(payload: TPayload): TPayload {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return Object.freeze([...payload]) as TPayload;
  return Object.freeze({ ...payload }) as TPayload;
}

/** Capture every route, preflight and request value before durable onMutate awaits. */
export function prepareLifecycleMutationVariables<TPayload>(
  input: LifecycleMutationSnapshotInput,
  buildPayload: () => TPayload
): LifecycleMutationVariables<TPayload> {
  let preparedPayload: PreparedPayload<TPayload>;
  try {
    preparedPayload = Object.freeze({ ok: true, value: freezePayload(buildPayload()) });
  } catch (error) {
    // Keep validation failures inside the mutation lifecycle, as before.
    preparedPayload = Object.freeze({ ok: false, error });
  }

  return Object.freeze({
    ...input,
    lockRef: Object.freeze({ ...input.lockRef }),
    preparedPayload,
  });
}

function readPreparedPayload<TPayload>(variables: LifecycleMutationVariables<TPayload>): TPayload {
  if (!variables.preparedPayload.ok) throw variables.preparedPayload.error;
  return variables.preparedPayload.value;
}

export async function executeLifecycleMutation<TPayload, TResult>(
  variables: LifecycleMutationVariables<TPayload>,
  request: (vpsId: number, payload: TPayload) => Promise<TResult>
): Promise<TResult> {
  if (!variables.canMutateVps) throw new Error(variables.permissionError);
  await preflightVpsNotBusy({
    vpsId: variables.vpsId,
    knownBusy: variables.knownBusy,
    t: () => variables.busyError,
  });
  return request(variables.vpsId, readPreparedPayload(variables));
}
