export type StoredAuthPayload = {
  deviceId: string;
  deviceToken: string;
  signingSecret: string;
  account: {
    id: string;
    username: string;
    email: string;
    plan: string;
  };
};
