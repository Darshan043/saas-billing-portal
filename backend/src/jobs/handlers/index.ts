import type { WebhookHandler } from '../webhookProcessor';


export type HandlerRegistry = {
  register: (type: string, handler: WebhookHandler) => void;
  get: (type: string) => WebhookHandler | undefined;
  has: (type: string) => boolean;
  types: () => string[];
};

export function createRegistry(): HandlerRegistry {
  const handlers = new Map<string, WebhookHandler>();
  return {
    register(type, handler) {
      handlers.set(type, handler);
    },
    get(type) {
      return handlers.get(type);
    },
    has(type) {
      return handlers.has(type);
    },
    types() {
      return [...handlers.keys()].sort();
    },
  };
}

export const registry = createRegistry();

export function registerHandler(type: string, handler: WebhookHandler): void {
  registry.register(type, handler);
}
