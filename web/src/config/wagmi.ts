import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Base Sepolia USDC 컨트랙트 주소
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
export const USDC_DECIMALS = 6;

// Creator Vault (AttestationRegistry UUPS proxy, Base Sepolia) — on-chain 확인된 주소.
// VITE_VAULT_ADDRESS로 오버라이드 가능.
export const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS ||
  '0x758FE0a6B5d91C79B97b5F44508eA0CFA68A2e8E') as `0x${string}`;

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    // Injected: Rabby, MetaMask, Coinbase Wallet 등 브라우저 확장 자동 감지
    injected(),
  ],
  transports: {
    [baseSepolia.id]: http(),
  },
});

// ERC-20 transfer ABI (USDC 전송용)
export const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Creator Vault claim ABI — EOA creator의 직접 서명 경로(B)에서 사용.
// 웹/CDP creator는 백엔드 POST /claims/execute 경로를 쓰므로 이 ABI가 필요 없다.
export const CLAIM_ABI = [
  {
    name: 'claimCreatorBalance',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'claimableBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'creator', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
