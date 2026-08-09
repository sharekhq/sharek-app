// Derived from the credentials rather than kept as a separate on/off flag,
// which could contradict them and leave a route that exists but cannot work
// (research R13). A partial set is therefore safe — the feature simply stays
// invisible until all six are present.
export const isSupportConfigured = () =>
  !!process.env.ZOHO_DESK_REFRESH_TOKEN &&
  !!process.env.ZOHO_DESK_ORG_ID &&
  !!process.env.ZOHO_DESK_DEPARTMENT_ID &&
  !!process.env.ZOHO_DESK_CLIENT_ID &&
  !!process.env.ZOHO_DESK_CLIENT_SECRET &&
  !!process.env.ZOHO_DESK_DC;
