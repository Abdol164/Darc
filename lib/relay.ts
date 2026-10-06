/**
 * Server-side relaying: send a transaction as the relayer, wait for it, and read back what
 * it returned.
 *
 * The merchant and router functions return their outcome (approved or the refusal's reason)
 * but a transaction's return value is not on-chain, so after it lands we re-run the same call
 * as a simulation at the parent block. That reproduces exactly what the transaction saw.
 */
import { createPublicClient, defineChain, http, type Abi, type Address, type Hex } from "viem";
import { MONAD_TESTNET, RPC_URL } from "@/config/chain";
import { relayerWallet } from "./server";

export const chain = defineChain(MONAD_TESTNET);
export const serverClient = createPublicClient({ chain, transport: http(RPC_URL) });

export type Sent<T> = { result: T; hash: Hex; blockNumber: string; settleMs: number };

export async function sendAndRead<T>(call: {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}): Promise<Sent<T>> {
  const relayer = relayerWallet();
  // Settle time is measured here, submit to receipt, so it shows Monad rather than the
  // browser's network.
  const submitted = Date.now();
  const hash = await relayer.writeContract({ ...call, account: relayer.account, chain } as never);
  const receipt = await serverClient.waitForTransactionReceipt({ hash, pollingInterval: 100 });
  const settleMs = Date.now() - submitted;
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);

  const { result } = await serverClient.simulateContract({
    ...call,
    account: relayer.account,
    blockNumber: receipt.blockNumber - 1n,
  } as never);
  return { result: result as T, hash, blockNumber: receipt.blockNumber.toString(), settleMs };
}

/** What a call would return right now, without sending it. */
export async function preview<T>(call: {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}): Promise<T> {
  const { result } = await serverClient.simulateContract({ ...call, account: relayerWallet().account } as never);
  return result as T;
}
