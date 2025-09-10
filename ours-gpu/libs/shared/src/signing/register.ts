export type Hex32 = `0x${string}`;

// EIP-712 types for the Register struct
export const RegisterTypes = {
  Register: [
    { name: 'workerId', type: 'string' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'expires', type: 'uint256' },
  ],
} as const;

export type RegisterDomain = {
  name: string;
  version: string;
  chainId: number;
  salt?: Hex32;
};

export type RegisterMessage = {
  workerId: string;
  nonce: Hex32;
  expires: bigint;
};

export function toNumber(x: unknown, fallback = 0): number {
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  if (typeof x === 'bigint') return Number(x);
  if (typeof x === 'string') {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

export function toBigInt(x: unknown, fallback: bigint = 0n): bigint {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number') return BigInt(Math.trunc(x));
  if (typeof x === 'string') return BigInt(x);
  return fallback;
}

function safeString(x: unknown, fallback: string): string {
  if (typeof x === 'string') return x;
  if (typeof x === 'number' || typeof x === 'boolean' || typeof x === 'bigint')
    return String(x);
  return fallback;
}

export function buildRegisterDomain(input: {
  name: unknown;
  version: unknown;
  chainId: unknown;
  salt?: unknown;
}): RegisterDomain {
  const domain: RegisterDomain = {
    name: safeString(input?.name, 'OursGPU'),
    version: safeString(input?.version, '1'),
    chainId: toNumber(input?.chainId, 0),
  };
  if (typeof input?.salt === 'string') domain.salt = input.salt as Hex32;
  return domain;
}

export function buildRegisterMessage(input: {
  workerId: unknown;
  nonce: unknown;
  expires: unknown;
}): RegisterMessage {
  return {
    workerId: safeString(input?.workerId, ''),
    nonce: safeString(input?.nonce, '') as Hex32,
    expires: toBigInt(input?.expires),
  };
}

// Optional helper for consistent debug output
export function formatRegisterDebug(
  domain: RegisterDomain,
  msg: RegisterMessage,
): string {
  const salt = (domain.salt ?? '').slice(0, 10);
  return `domain.chainId=${domain.chainId} name=${domain.name} version=${domain.version} salt=${salt}... id=${msg.workerId} nonce=${msg.nonce} expires=${msg.expires.toString()}`;
}
