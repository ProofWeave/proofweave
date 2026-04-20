import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected, walletConnect } from 'wagmi/connectors';

// Base Sepolia USDC 컨트랙트 주소
export const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;
export const USDC_DECIMALS = 6;

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
