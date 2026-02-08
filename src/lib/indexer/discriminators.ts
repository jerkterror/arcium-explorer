import { createHash } from "crypto";

/**
 * Compute Anchor account discriminator: sha256("account:<Name>")[0..8]
 */
function anchorDiscriminator(name: string): Buffer {
  const hash = createHash("sha256").update(`account:${name}`).digest();
  return Buffer.from(hash.subarray(0, 8));
}

// Arcium on-chain account type names (must match the Anchor IDL exactly)
export const DISCRIMINATORS = {
  Cluster: anchorDiscriminator("Cluster"),
  ArxNode: anchorDiscriminator("ArxNode"),
  MXEAccount: anchorDiscriminator("MXEAccount"),
  ComputationDefinitionAccount: anchorDiscriminator("ComputationDefinitionAccount"),
  ComputationAccount: anchorDiscriminator("ComputationAccount"),
} as const;

export type AccountTypeName = keyof typeof DISCRIMINATORS;

const DISCRIMINATOR_ENTRIES = Object.entries(DISCRIMINATORS) as [AccountTypeName, Buffer][];

/**
 * Match first 8 bytes of account data against known discriminators.
 * Returns the account type name or null if unrecognized.
 */
export function identifyAccountType(data: Buffer | Uint8Array): AccountTypeName | null {
  if (data.length < 8) return null;

  for (const [name, disc] of DISCRIMINATOR_ENTRIES) {
    let match = true;
    for (let i = 0; i < 8; i++) {
      if (data[i] !== disc[i]) {
        match = false;
        break;
      }
    }
    if (match) return name;
  }

  return null;
}

/**
 * Get discriminator bytes for a given account type (for memcmp filters).
 */
export function getDiscriminatorBytes(type: AccountTypeName): Buffer {
  return DISCRIMINATORS[type];
}
