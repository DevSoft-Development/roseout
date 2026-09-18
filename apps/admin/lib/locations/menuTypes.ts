export type MenuStatus = "draft" | "published" | "hidden";

export type MenuActorContext = {
  userId?: string;
  canonicalLocationId: string;
  location: Record<string, any>;
  isAdmin?: boolean;
  isDemoMode?: boolean;
  permissions?: { canRead?: boolean; canEdit?: boolean };
};

export type SaveLocationMenuInput = Record<string, any> & { action?: string };

export type LocationMenuPayload = {
  ok: true;
  data: {
    location: Record<string, any> | null;
    page: Record<string, any> | null;
    sections: Record<string, any>[];
    items: Record<string, any>[];
    previewUrl: string;
    permissions: { canEdit: boolean; canRead: boolean };
  };
};
