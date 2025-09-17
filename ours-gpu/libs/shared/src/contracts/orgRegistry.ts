import type { Abi } from 'viem'

// Minimal OrgRegistry ABI for reads used by controller/frontend
export const OrgRegistryAbi = [
  // organizations mapping fields are not needed for now
  {
    type: 'function',
    name: 'organizations',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'parentOrg', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'baseRate', type: 'uint256' },
      { name: 'perLevelMarkup', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'userOrganizations',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'nodeOrganizations',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'calculateFee',
    stateMutability: 'view',
    inputs: [
      { name: 'userOrg', type: 'uint256' },
      { name: 'nodeOrg', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi
