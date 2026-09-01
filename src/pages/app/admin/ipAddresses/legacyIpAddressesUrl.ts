import { getRuntimeConfig } from '../../../../app/config';

export function legacyIpAddressesUrl(legacyWebuiUrl: string | undefined): string | undefined {
  return legacyWebuiUrl
    ? `${legacyWebuiUrl.replace(/\/$/, '')}/?page=networking&action=ip_addresses`
    : undefined;
}

export function configuredLegacyIpAddressesUrl(): string | undefined {
  return legacyIpAddressesUrl(getRuntimeConfig().legacyWebuiUrl);
}
