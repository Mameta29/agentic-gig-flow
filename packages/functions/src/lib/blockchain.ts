import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  type Address,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { polygon, polygonAmoy } from 'viem/chains';
import { env } from './env.js';
import { getSecret } from './key-vault.js';
import { logger } from './logger.js';

// Minimal JPYC ABI: transfer + balanceOf + decimals (ERC-20 subset).
export const JPYC_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

const JPYC_DECIMALS = 18;

// Select the Polygon chain from POLYGON_CHAIN_ID so mainnet/testnet is a
// config switch, not a code change. viem signs txs with the chain's id, so
// this must match the network behind POLYGON_RPC.
function getChain() {
  return env.polygonChainId() === polygonAmoy.id ? polygonAmoy : polygon;
}

export type TransferResult = {
  txHash: Hash;
  blockNumber: bigint;
  from: Address;
  to: Address;
  amountJpyc: number;
};

export type Blockchain = {
  transferJpyc(opts: { to: string; amountJpyc: number }): Promise<TransferResult>;
  getBalance(address: string): Promise<bigint>;
};

let walletClient: WalletClient | null = null;
let publicClient: PublicClient | null = null;
let cachedAccount: PrivateKeyAccount | null = null;

async function loadWalletClient(): Promise<{
  walletClient: WalletClient;
  account: PrivateKeyAccount;
}> {
  if (walletClient && cachedAccount) {
    return { walletClient, account: cachedAccount };
  }
  const pkRaw = await getSecret(env.walletPkSecretName());
  const pk = (pkRaw.startsWith('0x') ? pkRaw : `0x${pkRaw}`) as `0x${string}`;
  const account = privateKeyToAccount(pk);
  walletClient = createWalletClient({
    account,
    chain: getChain(),
    transport: http(env.polygonRpc()),
  });
  // Return the account object (not the address): passing the object makes
  // viem sign locally and use eth_sendRawTransaction. Passing a bare address
  // string makes viem fall back to eth_sendTransaction (node-side signing),
  // which public RPCs reject with "unknown account".
  cachedAccount = account;
  return { walletClient, account };
}

function getPublicClient(): PublicClient {
  if (publicClient) return publicClient;
  publicClient = createPublicClient({
    chain: getChain(),
    transport: http(env.polygonRpc()),
  });
  return publicClient;
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function transferJpyc(opts: {
  to: string;
  amountJpyc: number;
}): Promise<TransferResult> {
  if (!ADDRESS_RE.test(opts.to)) {
    throw new Error(`bad recipient address: ${opts.to}`);
  }
  if (!Number.isInteger(opts.amountJpyc) || opts.amountJpyc <= 0) {
    throw new Error(`bad amount: ${opts.amountJpyc}`);
  }

  const { walletClient, account } = await loadWalletClient();
  const value = parseUnits(String(opts.amountJpyc), JPYC_DECIMALS);

  const txHash = await walletClient.writeContract({
    address: env.jpycAddress(),
    abi: JPYC_ABI,
    functionName: 'transfer',
    args: [opts.to as Address, value],
    account,
    chain: getChain(),
  });

  logger.info(
    { txHash, to: opts.to, amountJpyc: opts.amountJpyc },
    'jpyc transfer submitted',
  );

  const receipt = await getPublicClient().waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
  });

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    from: account.address,
    to: opts.to as Address,
    amountJpyc: opts.amountJpyc,
  };
}

export async function getBalance(address: string): Promise<bigint> {
  const balance = (await getPublicClient().readContract({
    address: env.jpycAddress(),
    abi: JPYC_ABI,
    functionName: 'balanceOf',
    args: [address as Address],
  })) as bigint;
  return balance;
}

export const blockchain: Blockchain = {
  transferJpyc,
  getBalance,
};
