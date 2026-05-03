export interface FinlaFeatures {
  outgoingInvoices: boolean;
  incomingInvoices: boolean;
  profile: boolean;
}

export const DEFAULT_FEATURES: FinlaFeatures = {
  outgoingInvoices: false,
  incomingInvoices: false,
  profile: false,
};
