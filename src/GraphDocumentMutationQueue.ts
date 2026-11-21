const queues = new WeakMap<object, Map<string, Promise<unknown>>>();
const activeMembershipWrites = new WeakMap<object, Set<string>>();

export function queueGraphDocumentMutation<T>(host: object, path: string, action: () => Promise<T>, scope?: "badge-membership"): Promise<T> {
  let owners = queues.get(host);
  if (!owners) {
    owners = new Map();
    queues.set(host, owners);
  }
  const previous = owners.get(path) ?? Promise.resolve();
  const pending = previous.catch(() => undefined).then(async () => {
    if (!scope) return action();
    const active = activeMembershipWrites.get(host) ?? new Set<string>();
    activeMembershipWrites.set(host, active);
    active.add(path);
    try {
      return await action();
    } finally {
      active.delete(path);
    }
  });
  owners.set(path, pending);
  void pending.finally(() => {
    if (owners.get(path) === pending) owners.delete(path);
  }).catch(() => undefined);
  return pending;
}

export function isBadgeMembershipWriteActive(host: object, path: string): boolean {
  return activeMembershipWrites.get(host)?.has(path) ?? false;
}

export async function drainGraphDocumentMutations(host: object): Promise<void> {
  await Promise.allSettled([...(queues.get(host)?.values() ?? [])]);
}
