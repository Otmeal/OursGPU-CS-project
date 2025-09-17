// This file re-exports the ABI from the Foundry build artifact copied under libs/shared/abi.
// Run `forge build` and then sync ABI (see scripts/dev-up.sh or `pnpm abi:sync`).
// Import JSON with NodeNext + Vite via resolveJsonModule or JSON import assertion.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - allow json import typing fallback
import artifact from '../../abi/JobManager.json' assert { type: 'json' };

// Cast artifact.abi to viem's Abi type. Avoid `as const` on a non-literal expression.
export const JobManagerAbi = (artifact as any).abi as import('viem').Abi;



export type CreateJobParams = {
  requester: `0x${string}`;
  orgId: bigint;
  target: `0x${string}`;
  difficulty: bigint;
  reward: bigint;
  worker: `0x${string}`;
  nonce: bigint;
  deadline: bigint;
  controller: `0x${string}`;
};
