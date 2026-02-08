import {
  Connection,
  PublicKey,
  type AccountInfo,
  type GetProgramAccountsFilter,
} from "@solana/web3.js";
import { ARCIUM_PROGRAM_ID } from "@/lib/constants";
import { DISCRIMINATORS, identifyAccountType, type AccountTypeName } from "./discriminators";

export { DISCRIMINATORS, identifyAccountType, type AccountTypeName };

const ARCIUM_PROGRAM = new PublicKey(ARCIUM_PROGRAM_ID);

export interface RawAccountData {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
}

export async function fetchProgramAccounts(
  connection: Connection,
  discriminator?: Buffer
): Promise<RawAccountData[]> {
  const filters: GetProgramAccountsFilter[] = [];

  if (discriminator) {
    filters.push({
      memcmp: {
        offset: 0,
        bytes: discriminator.toString("base64"),
        encoding: "base64",
      },
    });
  }

  try {
    const accounts = await connection.getProgramAccounts(ARCIUM_PROGRAM, {
      filters: filters.length > 0 ? filters : undefined,
      commitment: "confirmed",
    });

    return accounts.map((a) => ({
      pubkey: a.pubkey,
      account: a.account,
    }));
  } catch (error) {
    console.error("Error fetching program accounts:", error);
    return [];
  }
}

export async function fetchAccountsByType(
  connection: Connection,
  type: AccountTypeName
): Promise<RawAccountData[]> {
  return fetchProgramAccounts(connection, DISCRIMINATORS[type]);
}

export async function fetchAccountInfo(
  connection: Connection,
  pubkey: PublicKey
): Promise<AccountInfo<Buffer> | null> {
  try {
    return await connection.getAccountInfo(pubkey, "confirmed");
  } catch (error) {
    console.error(`Error fetching account ${pubkey.toBase58()}:`, error);
    return null;
  }
}

export async function fetchMultipleAccounts(
  connection: Connection,
  pubkeys: PublicKey[]
): Promise<(AccountInfo<Buffer> | null)[]> {
  const BATCH_SIZE = 100;
  const results: (AccountInfo<Buffer> | null)[] = [];

  for (let i = 0; i < pubkeys.length; i += BATCH_SIZE) {
    const batch = pubkeys.slice(i, i + BATCH_SIZE);
    const batchResults = await connection.getMultipleAccountsInfo(batch, "confirmed");
    results.push(...batchResults);
  }

  return results;
}

// Re-export parsers for backward compatibility
export { parseClusterAccount, parseArxNodeAccount } from "./parsers";

export { ARCIUM_PROGRAM };
