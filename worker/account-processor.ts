import { identifyAccountType } from "@/lib/indexer/discriminators";
import {
  parseClusterAccount,
  parseArxNodeAccount,
  parseMXEAccount,
  parseComputationDefinitionAccount,
  parseComputationAccount,
} from "@/lib/indexer/parsers";
import {
  upsertCluster,
  upsertArxNode,
  upsertMXEAccount,
  upsertComputationDefinition,
  upsertComputation,
} from "@/lib/indexer/upsert";
import type { Network } from "@/types";
import { createLogger } from "./logger";

const log = createLogger("processor");

export interface AccountUpdate {
  address: string;
  data: Buffer | Uint8Array;
  network: Network;
}

/**
 * Process a single account update: identify type, parse, upsert.
 * Returns the account type name if processed, null if skipped.
 */
export async function processAccountUpdate(update: AccountUpdate): Promise<string | null> {
  const { address, data, network } = update;
  const buf = Buffer.from(data);

  const accountType = identifyAccountType(buf);
  if (!accountType) {
    log.debug("Unknown account type, skipping", { address });
    return null;
  }

  try {
    switch (accountType) {
      case "Cluster": {
        const parsed = parseClusterAccount(buf);
        if (parsed) {
          await upsertCluster(address, parsed, network);
          log.debug("Upserted cluster", { address });
        }
        break;
      }
      case "ArxNode": {
        const parsed = parseArxNodeAccount(buf);
        if (parsed) {
          await upsertArxNode(address, parsed, network);
          log.debug("Upserted arx node", { address });
        }
        break;
      }
      case "MXEAccount": {
        const parsed = parseMXEAccount(buf);
        if (parsed) {
          await upsertMXEAccount(address, parsed, network);
          log.debug("Upserted MXE account", { address });
        }
        break;
      }
      case "ComputationDefinitionAccount": {
        const parsed = parseComputationDefinitionAccount(buf);
        if (parsed) {
          await upsertComputationDefinition(address, parsed, network);
          log.debug("Upserted computation definition", { address });
        }
        break;
      }
      case "ComputationAccount": {
        const parsed = parseComputationAccount(buf);
        if (parsed) {
          await upsertComputation(address, parsed, network);
          log.debug("Upserted computation", { address });
        }
        break;
      }
    }
    return accountType;
  } catch (error) {
    log.error("Failed to process account", {
      address,
      accountType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
