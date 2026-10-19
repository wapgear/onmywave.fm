export type RetryFocusOptions = {
  ownerKey: string;
  target: () => HTMLElement | null;
  canFocusSuccess: () => boolean;
};

export type PassiveFocus = {
  ownerKey: string;
  button: HTMLButtonElement;
  scope: HTMLElement | null;
  scopes: HTMLElement[];
  cancelled: boolean;
};
