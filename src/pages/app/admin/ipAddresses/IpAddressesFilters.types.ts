import type React from 'react';
import type { SmartFilterSuggestion } from '../../../../components/ui/SmartFilterInput';
import type { Location as InfraLocation } from '../../../../lib/api/infra';

type SetTextParam = (key: string, value: string | undefined) => void;
type SetIntParam = (key: string, value: number | undefined | null) => void;
type SetResolvedUserFilter = (value: number | undefined | null) => void;
type SetBoolParam = (key: string, value: boolean | undefined) => void;

export interface IpAddressesFiltersProps {
  smart: string;
  setSmart: (value: string) => void;
  smartErrors: string[];
  clearSmartErrors: () => void;
  smartInputRef: React.RefObject<HTMLInputElement | null>;
  smartNeedle: string;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  activeFilterChips: React.ReactNode[];
  smartSuggestions: SmartFilterSuggestion[];
  applySmartText: (raw: string) => Promise<void>;
  filtersActive: boolean;
  shareUrl: string;
  clearFilters: () => void;
  addr: string;
  prefixNum: number | undefined;
  vpsId: number | undefined;
  userLookup: string;
  setUserLookup: (value: string) => void;
  networkId: number | undefined;
  ifaceId: number | undefined;
  locationId: number | undefined;
  environmentLocations: InfraLocation[];
  versionNum: 4 | 6 | undefined;
  assignedToInterface: boolean | undefined;
  order: 'asc' | 'desc' | 'interface';
  setTextParam: SetTextParam;
  setIntParam: SetIntParam;
  setResolvedUserFilter: SetResolvedUserFilter;
  setBoolParamInUrl: SetBoolParam;
}
