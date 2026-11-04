import type { HexclaveConfig } from "@stackframe/stack";

export const config: HexclaveConfig = {
  apps: {
    installed: {
      authentication: { enabled: true },
      emails: { enabled: true },
    },
  },
  auth: {
    allowSignUp: true,
    password: { allowSignIn: true },
    otp: { allowSignIn: false },
    passkey: { allowSignIn: false },
    oauth: {
      providers: {
        google: { type: "google", allowSignIn: false, allowConnectedAccounts: false },
        github: { type: "github", allowSignIn: false, allowConnectedAccounts: false },
        microsoft: { type: "microsoft", allowSignIn: false, allowConnectedAccounts: false },
      },
    },
  },
  onboarding: { requireEmailVerification: true },
};
