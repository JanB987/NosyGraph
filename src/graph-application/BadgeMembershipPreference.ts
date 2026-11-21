export const BADGE_MEMBERSHIP_LABEL = "Also add to graph membership";
export const BADGE_MEMBERSHIP_DESCRIPTION = "Add linked notes alongside the badge’s parent in its current graph or lens.";

export function normalizeBadgeMembershipPreference(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

export interface BadgeMembershipPreferenceState {
  value: boolean;
  saving: boolean;
}

export interface BadgeMembershipPreferencePort {
  get(): BadgeMembershipPreferenceState;
  set(value: boolean): Promise<void>;
  subscribe(listener: (state: BadgeMembershipPreferenceState) => void): () => void;
}

export class BadgeMembershipPreference implements BadgeMembershipPreferencePort {
  private pending?: { value: boolean };
  private listeners = new Set<(state: BadgeMembershipPreferenceState) => void>();

  constructor(private readonly readSaved: () => boolean, private readonly save: (value: boolean) => Promise<void>) {}

  get(): BadgeMembershipPreferenceState {
    return { value: this.pending?.value ?? this.readSaved(), saving: this.pending !== undefined };
  }

  async set(value: boolean): Promise<void> {
    const revision = { value };
    this.pending = revision;
    this.publish();
    try {
      await this.save(value);
    } finally {
      if (this.pending === revision) {
        this.pending = undefined;
        this.publish();
      }
    }
  }

  subscribe(listener: (state: BadgeMembershipPreferenceState) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private publish(): void {
    const state = this.get();
    for (const listener of this.listeners) listener(state);
  }
}
