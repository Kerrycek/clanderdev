import type { ChangeRequest, RegistrationRequest } from '../../../lib/api/requests';

export type RequestReviewType = 'registration' | 'change';

export type ReviewableRequest = RegistrationRequest | ChangeRequest;

export type RequestResolveOverrides = {
  login: string;
  fullName: string;
  orgName: string;
  orgId: string;
  email: string;
  address: string;
  changeReason: string;
};
