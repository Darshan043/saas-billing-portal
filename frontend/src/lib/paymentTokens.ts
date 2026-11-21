export const SIMULATOR_PAYMENT_METHODS = [
  {
    token: 'tok_sim_visa_ok',
    label: 'Success',
    description: 'First payment succeeds and the subscription activates.',
  },
  {
    token: 'tok_sim_declined',
    label: 'Card declined',
    description: 'The simulator declines the card.',
  },
  {
    token: 'tok_sim_insufficient_funds',
    label: 'Insufficient funds',
    description: 'The simulator reports insufficient funds.',
  },
] as const;

export type SimulatorPaymentToken =
  (typeof SIMULATOR_PAYMENT_METHODS)[number]['token'];
