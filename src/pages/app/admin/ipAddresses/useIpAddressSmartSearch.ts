import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../../../../app/i18n';
import { useToasts } from '../../../../app/toasts';
import type { SmartFilterSuggestion } from '../../../../components/ui/SmartFilterInput';
import { findUserByExactLogin } from '../../../../lib/api/userLookups';
import { parseNonNegativeInt, parsePositiveInt } from '../../../../lib/parse';
import {
  parseNumericToken,
  splitKeyValueToken,
  tokenizeSmartInput,
  unquoteSmartValue,
} from '../../../../lib/smartFilter';

import {
  canonicalKey,
  looksLikeIpish,
  parseBoolToken,
  resolveOrderValue,
  resolveVersionValue,
} from './ipAddressListSemantics';

interface UseIpAddressSmartSearchOptions {
  searchParams: URLSearchParams;
  setSearchParams: (
    nextInit: URLSearchParams | string,
    navigateOpts?: { replace?: boolean }
  ) => void;
  legacyQuery: string;
  openIp: (ipId: number) => void;
  setAddressFilter: (addr: string, prefix?: string) => void;
  clearUrlFilters: () => void;
}

export function useIpAddressSmartSearch({
  searchParams,
  setSearchParams,
  legacyQuery,
  openIp,
  setAddressFilter,
  clearUrlFilters,
}: UseIpAddressSmartSearchOptions) {
  const { t } = useI18n();
  const toasts = useToasts();
  const [smart, setSmartValue] = useState('');
  const [smartErrors, setSmartErrors] = useState<string[]>([]);
  const smartNeedle = smart.trim();
  const smartInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [smartResolving, setSmartResolving] = useState(false);
  const [smartSearchBlocked, setSmartSearchBlocked] = useState(false);
  const lookupGenerationRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (smartNeedle === '?') setHelpOpen(true);
  }, [smartNeedle]);

  const cancelLookup = useCallback(() => {
    lookupGenerationRef.current += 1;
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    setSmartResolving(false);
  }, []);

  const searchParamsSignature = searchParams.toString();
  const latestSearchParamsSignatureRef = useRef(searchParamsSignature);
  const previousSearchParamsSignatureRef = useRef(searchParamsSignature);
  latestSearchParamsSignatureRef.current = searchParamsSignature;

  useEffect(() => {
    if (previousSearchParamsSignatureRef.current === searchParamsSignature) return;

    previousSearchParamsSignatureRef.current = searchParamsSignature;
    if (lookupAbortRef.current) cancelLookup();
    setSmartErrors([]);
    setSmartSearchBlocked(false);
  }, [cancelLookup, searchParamsSignature]);

  useEffect(() => () => {
    lookupGenerationRef.current += 1;
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
  }, []);

  const clearSmartErrors = () => {
    setSmartErrors([]);
    setSmartSearchBlocked(false);
  };

  const dismissSmartErrors = useCallback(() => {
    cancelLookup();
    setSmartValue('');
    setSmartErrors([]);
    setSmartSearchBlocked(false);

    if (!legacyQuery) return;

    const next = new URLSearchParams(searchParams);
    next.delete('q');
    next.delete('from_id');
    next.delete('page');
    setSearchParams(next, { replace: true });
  }, [cancelLookup, legacyQuery, searchParams, setSearchParams]);

  const setSmart = (value: string) => {
    cancelLookup();
    setSmartSearchBlocked(false);
    setSmartValue(value);
  };

  const clearFilters = () => {
    cancelLookup();
    setSmartValue('');
    setSmartErrors([]);
    setSmartSearchBlocked(false);
    clearUrlFilters();
  };

  const applySmartText = async (raw: string) => {
    const input = String(raw ?? '').trim();
    if (!input) return;

    if (input === '?') {
      setHelpOpen(true);
      return;
    }

    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;
    setSmartResolving(false);
    const generation = lookupGenerationRef.current + 1;
    lookupGenerationRef.current = generation;

    const initialSearchParamsSignature = searchParamsSignature;
    const tokens = tokenizeSmartInput(input);

    if (tokens.length === 1) {
      const num = parseNumericToken(tokens[0] ?? '');
      if (num) {
        openIp(num);
        setSmartValue('');
        setSmartErrors([]);
        setSmartSearchBlocked(false);
        return;
      }
    }

    const next = new URLSearchParams(searchParams);
    const plain: string[] = [];
    const errors: string[] = [];
    const userLogins: string[] = [];

    const setNextText = (key: string, value: string | undefined) => {
      const trimmed = String(value ?? '').trim();
      if (trimmed) next.set(key, trimmed);
      else next.delete(key);
    };

    const setNextInt = (key: string, value: number | undefined) => {
      if (value !== undefined && Number.isFinite(value) && value > 0) {
        next.set(key, String(Math.floor(value)));
      } else {
        next.delete(key);
      }
    };

    const setNextAddress = (value: string, prefix?: string) => {
      setNextText('addr', value);
      setNextText('prefix', prefix);
    };

    for (const token of tokens) {
      const kv = splitKeyValueToken(token);
      if (!kv) {
        plain.push(unquoteSmartValue(token));
        continue;
      }

      const key = canonicalKey(kv.rawKey);
      if (!key) {
        plain.push(unquoteSmartValue(token));
        continue;
      }

      const valueRaw = unquoteSmartValue(kv.rawValue);
      if (!valueRaw.trim()) {
        errors.push(t('filters.smart.error.missing_value', { key: kv.rawKey.trim() }));
        continue;
      }

      switch (key) {
        case 'id': {
          const id = parseNumericToken(valueRaw);
          if (!id) errors.push(t('admin.ip_addresses.smart.error.id', { value: valueRaw }));
          else {
            setSmartValue('');
            setSmartErrors([]);
            setSmartSearchBlocked(false);
            openIp(id);
            return;
          }
          break;
        }
        case 'q': {
          if (looksLikeIpish(valueRaw)) {
            const match = valueRaw.trim().match(/^(.+?)\/(\d+)$/);
            setNextAddress(match?.[1] ?? valueRaw.trim(), match?.[2]);
          } else {
            userLogins.push(valueRaw);
          }
          break;
        }
        case 'addr': {
          const match = valueRaw.trim().match(/^(.+?)\/(\d+)$/);
          if (match && match[1] && match[2]) setNextAddress(match[1], match[2]);
          else setNextAddress(valueRaw.trim());
          break;
        }
        case 'prefix': {
          const prefix = parseNonNegativeInt(valueRaw);
          if (prefix === undefined || prefix < 0 || prefix > 128) {
            errors.push(t('admin.ip_addresses.smart.error.prefix', { value: valueRaw }));
          } else {
            setNextText('prefix', String(prefix));
          }
          break;
        }
        case 'vps':
        case 'network':
        case 'iface':
        case 'location': {
          const id = parsePositiveInt(valueRaw);
          if (!id) {
            errors.push(t('admin.ip_addresses.smart.error.int', { key, value: valueRaw }));
            break;
          }
          setNextInt(key === 'iface' ? 'network_interface' : key, id);
          break;
        }
        case 'user': {
          const id = parsePositiveInt(valueRaw);
          if (id) setNextInt('user', id);
          else userLogins.push(valueRaw);
          break;
        }
        case 'version': {
          const version = resolveVersionValue(valueRaw);
          if (!version) errors.push(t('admin.ip_addresses.smart.error.version', { value: valueRaw }));
          else setNextText('version', String(version));
          break;
        }
        case 'assigned': {
          const parsed = parseBoolToken(valueRaw);
          if (parsed === null) {
            errors.push(t('admin.ip_addresses.smart.error.bool', { key: 'assigned', value: valueRaw }));
          } else if (parsed === undefined) {
            next.delete('assigned_to_interface');
            next.set('occupancy', 'any');
          } else {
            next.set('assigned_to_interface', parsed ? '1' : '0');
            next.delete('occupancy');
          }
          break;
        }
        case 'order': {
          const parsed = resolveOrderValue(valueRaw);
          if (!parsed) errors.push(t('admin.ip_addresses.smart.error.order', { value: valueRaw }));
          else setNextText('order', parsed === 'desc' ? undefined : parsed);
          break;
        }
      }
    }

    const qPlain = plain.join(' ').trim();
    if (qPlain) {
      const match = qPlain.match(/^(.+?)\/(\d+)$/);
      if (match && match[1] && (match[1].includes('.') || match[1].includes(':'))) {
        setNextAddress(match[1], match[2]);
      } else if (looksLikeIpish(qPlain)) {
        setNextAddress(qPlain);
      } else {
        userLogins.push(qPlain);
      }
    }

    let usedUserLookup = false;
    for (const login of userLogins) {
      usedUserLookup = true;
      const controller = new AbortController();
      lookupAbortRef.current = controller;
      setSmartResolving(true);

      let resolvedUserId: number | null = null;
      try {
        resolvedUserId = (await findUserByExactLogin(login, { signal: controller.signal }))?.id ?? null;
      } catch {
        if (controller.signal.aborted || lookupGenerationRef.current !== generation) return;
        errors.push(t('admin.ip_addresses.smart.error.user_lookup', { value: login }));
        continue;
      }

      if (
        controller.signal.aborted ||
        lookupGenerationRef.current !== generation ||
        latestSearchParamsSignatureRef.current !== initialSearchParamsSignature
      ) return;

      if (resolvedUserId === null) {
        errors.push(t('filters.smart.error.user_unresolved', { value: login }));
      } else {
        setNextInt('user', resolvedUserId);
      }
    }

    if (
      lookupGenerationRef.current !== generation ||
      latestSearchParamsSignatureRef.current !== initialSearchParamsSignature
    ) return;

    lookupAbortRef.current = null;
    setSmartResolving(false);
    setSmartErrors(errors);
    if (errors.length > 0) {
      setSmartSearchBlocked(usedUserLookup);
      toasts.pushToast({ variant: 'danger', title: errors[0] ?? t('common.unknown_error') });
      return;
    }

    setSmartValue('');
    next.delete('q');
    next.delete('from_id');
    next.delete('page');
    setSmartSearchBlocked(false);
    setSearchParams(next);
  };

  useEffect(() => {
    if (!legacyQuery) return;

    setSmartValue(legacyQuery);
    void applySmartText(`q:${legacyQuery}`);
    // `applySmartText` intentionally stays out of the dependency list: the
    // A URL change restarts a pending legacy migration so changing another
    // filter cannot strand the page with an unresolved `q` parameter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyQuery, searchParamsSignature]);

  const smartSuggestions: SmartFilterSuggestion[] = useMemo(() => {
    if (!smartNeedle) return [];
    if (smartNeedle === '?') {
      return [{
        id: 'help',
        primary: t('filters.help.open'),
        secondary: t('filters.help.suggestion.secondary'),
        onPick: () => setHelpOpen(true),
        testId: 'admin.ip_addresses.smart.suggest.help',
      }];
    }

    const tokens = tokenizeSmartInput(smartNeedle);
    if (tokens.length === 1) {
      const kv = splitKeyValueToken(tokens[0] ?? '');
      if (kv && canonicalKey(kv.rawKey)) return [];
    }

    const suggestions: SmartFilterSuggestion[] = [];
    const num = parseNumericToken(smartNeedle);
    if (num) {
      suggestions.push({
        id: 'open',
        primary: t('admin.ip_addresses.smart.suggest.open', { id: num }),
        secondary: t('admin.ip_addresses.smart.suggest.open.secondary'),
        onPick: () => {
          openIp(num);
          setSmartValue('');
          setSmartErrors([]);
        },
        testId: 'admin.ip_addresses.smart.suggest.open',
      });
    }

    if (looksLikeIpish(smartNeedle)) {
      const match = smartNeedle.match(/^(.+?)\/(\d+)$/);
      const addr = match?.[1] ?? smartNeedle;
      const prefix = match?.[2];
      suggestions.push({
        id: 'addr',
        primary: prefix
          ? t('admin.ip_addresses.smart.suggest.addr_prefix', { addr, prefix })
          : t('admin.ip_addresses.smart.suggest.addr', { addr }),
        secondary: t('admin.ip_addresses.smart.suggest.addr.secondary'),
        onPick: () => {
          setAddressFilter(addr, prefix);
          setSmartValue('');
          setSmartErrors([]);
        },
        testId: 'admin.ip_addresses.smart.suggest.addr',
      });
    }

    return suggestions;
  }, [openIp, setAddressFilter, smartNeedle, t]);

  return {
    smart,
    setSmart,
    smartErrors,
    clearSmartErrors,
    dismissSmartErrors,
    smartNeedle,
    smartInputRef,
    helpOpen,
    setHelpOpen,
    smartResolving,
    smartSearchBlocked,
    clearFilters,
    applySmartText,
    smartSuggestions,
  };
}
