import { WebStorageStateStore } from "oidc-client-ts";

// Your Cognito domain (used only for logout)
export const COGNITO_DOMAIN =
  "https://expense-tracker-2026-xyz789.auth.us-east-2.amazoncognito.com";

export const authConfig = {
  // Use the IDP endpoint as the authority – it returns the correct discovery document
  authority: "https://cognito-idp.us-east-2.amazonaws.com/us-east-2_p9qfpUExB",
  client_id: "hefqfkkhb8u83t55uva6328o1",
  redirect_uri: "http://localhost:5173/dashboard",
  post_logout_redirect_uri: "http://localhost:5173/",
  response_type: "code",
  scope: "openid email profile",
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: false,
};