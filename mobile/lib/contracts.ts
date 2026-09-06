export type MobileIdentityDto = {
  kind: "user" | "guest";
  userId: string | null;
  guestId: string | null;
  authenticated: boolean;
};

export type MobileSessionResponse = {
  ok: true;
  identity: MobileIdentityDto;
};

export type MobileProfileDto = {
  kind: "user" | "guest";
  userId: string | null;
  guestId: string | null;
  email: string | null;
};

export type MobileMeResponse = {
  ok: true;
  profile: MobileProfileDto;
};

export type MobileErrorResponse = {
  ok: false;
  error: string;
  message: string;
};
