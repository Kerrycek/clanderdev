import { expectArray, haveApiCall } from './haveapi';
import { publicApiCall } from './public';

export interface HelpBoxLanguage {
  id: number;
  code?: string;
  label?: string;
  [k: string]: unknown;
}

export interface HelpBox {
  id: number;
  page?: string;
  action?: string;
  language?: HelpBoxLanguage | null;
  content?: string;
  order?: number;
  [k: string]: unknown;
}

export type ContextualHelpAccessMode = 'public' | 'authenticated';

export async function fetchHelpBoxesAdmin(opts?: {
  page?: string;
  action?: string;
  language?: number | null;
  fromId?: number;
  limit?: number;
}) {
  const params: Record<string, unknown> = {};
  if (opts?.page) params['page'] = opts.page;
  if (opts?.action) params['action'] = opts.action;
  if (opts?.fromId !== undefined) params['from_id'] = opts.fromId;
  if (opts?.limit !== undefined) params['limit'] = opts.limit;
  if (opts && Object.prototype.hasOwnProperty.call(opts, 'language')) {
    // language is a resource param and can be explicitly null
    params['language'] = opts.language;
  }

  const res = await haveApiCall<HelpBox[]>({
    method: 'GET',
    path: '/help_boxes',
    namespace: 'help_box',
    params,
  });

  return { ...res, data: expectArray<HelpBox>(res.data, 'help_boxes#index') };
}

export async function createHelpBox(payload: {
  page: string;
  action: string;
  language?: number | null;
  order?: number;
  content: string;
}) {
  const params: Record<string, unknown> = {
    page: payload.page,
    action: payload.action,
    content: payload.content,
  };

  if (payload.order !== undefined) params['order'] = payload.order;
  if (Object.prototype.hasOwnProperty.call(payload, 'language')) params['language'] = payload.language;

  return haveApiCall<HelpBox>({
    method: 'POST',
    path: '/help_boxes',
    namespace: 'help_box',
    params,
  });
}

export async function updateHelpBox(
  id: number,
  payload: {
    page?: string;
    action?: string;
    language?: number | null;
    order?: number;
    content?: string;
  }
) {
  const params: Record<string, unknown> = {};
  if (payload.page !== undefined) params['page'] = payload.page;
  if (payload.action !== undefined) params['action'] = payload.action;
  if (payload.content !== undefined) params['content'] = payload.content;
  if (payload.order !== undefined) params['order'] = payload.order;
  if (Object.prototype.hasOwnProperty.call(payload, 'language')) params['language'] = payload.language;

  return haveApiCall<HelpBox>({
    method: 'PUT',
    path: `/help_boxes/${id}`,
    namespace: 'help_box',
    params,
  });
}

export async function deleteHelpBox(id: number) {
  return haveApiCall<void>({
    method: 'DELETE',
    path: `/help_boxes/${id}`,
    namespace: 'help_box',
  });
}

export async function fetchContextualHelpBoxes(
  page: string,
  action: string,
  accessMode: ContextualHelpAccessMode
) {
  const request = {
    path: '/help_boxes',
    namespace: 'help_box',
    params: { page, action, view: true },
  };
  const res = accessMode === 'authenticated'
    ? await haveApiCall<HelpBox[]>({ method: 'GET', ...request })
    : await publicApiCall<HelpBox[]>(request);

  return { ...res, data: expectArray<HelpBox>(res.data, 'help_boxes#view') };
}
