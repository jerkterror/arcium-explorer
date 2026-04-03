/**
 * Client-safe Arcium error constants.
 * Error codes extracted from @arcium-hq/client IDL (v0.9.3).
 * No Node.js / SDK imports — safe for use in "use client" components.
 */

/**
 * Sentinel value stored in callbackErrorCode to mark a computation as
 * permanently unenrichable (e.g. tx history unavailable). Must be checked
 * anywhere callbackErrorCode is read — this is NOT a real Anchor error code.
 */
export const UNENRICHABLE_SENTINEL = -1;

export interface ArciumError {
  name: string;
  msg: string;
}

/** Arcium on-chain error codes (from IDL v0.9.3). */
const ARCIUM_ERRORS: Record<number, ArciumError> = {
  6000: { name: "InvalidAuthority", msg: "The given authority is invalid" },
  6001: { name: "MxeKeysAlreadySet", msg: "The MXE keys are already set" },
  6002: { name: "MxeKeysNotSet", msg: "The MXE keys are not set" },
  6003: { name: "InvalidMXE", msg: "An invalid MXE account has been supplied" },
  6004: { name: "ClusterAlreadySet", msg: "The cluster is already set" },
  6005: { name: "ClusterNotSet", msg: "The cluster is not set" },
  6006: { name: "InvalidCluster", msg: "An invalid cluster account has been supplied" },
  6007: { name: "InvalidComputationDefinition", msg: "An invalid computation definition account has been supplied" },
  6008: { name: "CantFindMempoolID", msg: "Couldn't find a mempool ID for the computation" },
  6100: { name: "InvalidMempoolDiscriminator", msg: "Mempool discriminator is invalid" },
  6101: { name: "InvalidMempoolSize", msg: "Mempool size is invalid" },
  6102: { name: "InvalidExecpoolDiscriminator", msg: "Execpool discriminator is invalid" },
  6103: { name: "MaxParallelismReached", msg: "Max parallelism reached" },
  6200: { name: "InvalidComputationOffset", msg: "Computation offset is invalid" },
  6201: { name: "InvalidCallbackAccs", msg: "Callback accounts are invalid" },
  6202: { name: "InvalidCallbackAccsLen", msg: "Callback accounts length is invalid" },
  6203: { name: "AlreadyInitializedComputation", msg: "The computation is already initialized" },
  6204: { name: "AlreadyCallbackedComputation", msg: "Callback computation already called" },
  6205: { name: "InvalidCallbackTx", msg: "Callback tx is invalid" },
  6206: { name: "InvalidComputationStatus", msg: "Computation status is invalid" },
  6207: { name: "InvalidComputation", msg: "Computation is invalid" },
  6208: { name: "InvalidComputationAuthority", msg: "Computation authority is invalid" },
  6209: { name: "InvalidCallbackInstructions", msg: "Callback instructions are invalid" },
  6210: { name: "ComputationNotExpired", msg: "Computation has not expired from mempool yet" },
  6211: { name: "InvalidCallbackIndex", msg: "Invalid callback transaction index" },
  6212: { name: "MultiTxCallbacksDisabled", msg: "Multi-transaction callbacks disabled" },
  6300: { name: "ComputationDefinitionNotCompleted", msg: "Computation definition is not completed" },
  6301: { name: "InvalidArguments", msg: "Arguments supplied are invalid" },
  6302: { name: "InvalidCircuitSource", msg: "Circuit source is invalid" },
  6303: { name: "ComputationDefinitionAlreadyCompleted", msg: "Computation definition already completed" },
  6304: { name: "InvalidCUAmount", msg: "CU amount exceeds maximum limit" },
  6305: { name: "InvalidOffset", msg: "Offset is invalid" },
  6400: { name: "InvalidNode", msg: "Node is invalid" },
  6401: { name: "MaxClusterMembershipReached", msg: "Maximum number of nodes in the cluster has been reached" },
  6402: { name: "NodeAlreadyExists", msg: "The node already exists in the cluster" },
  6403: { name: "InvalidNodeAuthority", msg: "Node authority is invalid" },
  6404: { name: "NodeNotInactive", msg: "Node is not inactive" },
  6405: { name: "NodeNotActive", msg: "Node is not active" },
  6406: { name: "InvalidClusterMembership", msg: "Cluster membership is invalid" },
  6407: { name: "NodeInActiveCluster", msg: "Node is in an active cluster" },
  6408: { name: "InvalidNodeConfig", msg: "Node config is invalid" },
  6409: { name: "UnauthorizedNodeCreation", msg: "Unauthorized to create node on mainnet" },
  6410: { name: "InvalidNodeOffset", msg: "Node offset is invalid" },
  6500: { name: "ClusterFull", msg: "Cluster is full" },
  6501: { name: "InvalidDeactivationEpoch", msg: "Cluster deactivation epoch is invalid" },
  6502: { name: "InvalidMaxSize", msg: "Cluster maximum size is invalid" },
  6503: { name: "InvalidClusterAuthority", msg: "Cluster authority is invalid" },
  6504: { name: "InvalidFeeProposal", msg: "Cluster fee proposal is invalid" },
  6505: { name: "InvalidClusterState", msg: "Cluster state is invalid" },
  6506: { name: "InvalidVote", msg: "Cluster vote is invalid" },
  6507: { name: "ClusterNotReady", msg: "Cluster is not ready" },
  6508: { name: "BlsPubkeyNotSet", msg: "Bls pubkey not set" },
  6600: { name: "SerializationFailed", msg: "Borsh serialization failed" },
  6601: { name: "DeserializationFailed", msg: "Borsh deserialization failed" },
  6602: { name: "HeapFull", msg: "Heap is full" },
  6603: { name: "InvalidSlot", msg: "Current slot is before the last updated slot" },
  6604: { name: "EpochIsInfinity", msg: "Epoch is infinity" },
  6605: { name: "InvalidTimestamp", msg: "Timestamp is invalid" },
  6606: { name: "InvalidEpoch", msg: "Epoch is invalid" },
  6607: { name: "EpochOverflow", msg: "Epoch overflowed" },
  6608: { name: "InvalidLighthouseProgramID", msg: "Lighthouse program ID is invalid" },
  6609: { name: "ExtraInstructionFound", msg: "Extra instruction found in transaction" },
  6610: { name: "InvalidLighthouseInstructionCount", msg: "Invalid number of Lighthouse program instructions" },
  6611: { name: "InvalidSignature", msg: "Invalid BLS signature" },
  6612: { name: "ValueAlreadySet", msg: "Value already set" },
  6613: { name: "InvalidValueSetterIndex", msg: "Invalid value setter index" },
  6614: { name: "NotAllNodesVotedForBlsPublicKey", msg: "Not all nodes have voted for the BLS public key" },
  6615: { name: "KeysharesIndexOutOfBounds", msg: "Keyshares index out of bounds" },
  6616: { name: "RecoveryKeyMaterialNotSet", msg: "Recovery key material not set" },
  6617: { name: "RecoveryInitAlreadyFinalized", msg: "Recovery already finalized" },
  6618: { name: "InvalidRecoveryPeersCount", msg: "Invalid number of recovery peers" },
  6619: { name: "BlsPublicKeyZero", msg: "BLS public key is zero" },
  6620: { name: "MustNotBeCalledViaCpi", msg: "This instruction must be called directly, not via CPI" },
  6621: { name: "FeePriceExceedsMax", msg: "Fee price exceeds maximum allowed" },
  6622: { name: "NoFeesToClaim", msg: "No fees available to claim" },
  6623: { name: "RecoveryPeerOffsetZero", msg: "Recovery peer offset is zero" },
  6624: { name: "InvalidDomainSeparator", msg: "Invalid domain separator" },
  6700: { name: "MxeNotInMigrationState", msg: "MXE is not in migration state" },
  6701: { name: "MxeAlreadyInMigration", msg: "MXE is already in migration state" },
  6702: { name: "BackupKeygenNotComplete", msg: "Backup MXE keygen is not complete" },
  6703: { name: "RecoveryAuthorityMismatch", msg: "Authority mismatch between original and backup MXE" },
  6704: { name: "RecoveryPeersNotInitialized", msg: "Recovery peers account not initialized" },
  6705: { name: "InvalidRecoveryPeerOffset", msg: "Invalid peer offset for recovery share submission" },
  6706: { name: "NotRecoveryPeer", msg: "Signer is not a valid recovery peer" },
  6707: { name: "RecoveryExecutionAlreadyFinalized", msg: "Recovery execution already finalized" },
  6708: { name: "RecoveryThresholdNotMet", msg: "Recovery threshold not met" },
  6709: { name: "RecoveryExecutionNotFinalized", msg: "Recovery execution not finalized" },
  6710: { name: "RecoveryComputationNotFailed", msg: "Previous computation did not fail, cannot requeue" },
  6711: { name: "RecoveryActiveComputationExists", msg: "Cannot close recovery with active computation" },
  6712: { name: "RecoveryExecutionNotSuccess", msg: "Callback requires successful execution status" },
  6713: { name: "BackupClusterNotSet", msg: "Backup MXE cluster is not set" },
  6714: { name: "ShareAlreadySubmitted", msg: "Share already submitted" },
  6715: { name: "ArithmeticOverflow", msg: "Arithmetic overflow" },
  6716: { name: "MxeInMigrationState", msg: "MXE is in migration state, cannot queue new computations" },
  6717: { name: "PermissionedRecoveryPeersNotDistinct", msg: "Permissioned recovery peers to add must be distinct" },
  6718: { name: "TooManyPermissionedRecoveryPeers", msg: "Too many permissioned recovery peers to add" },
  6719: { name: "RemoveNonExistingPermissionedRecoveryPeers", msg: "Can only remove existing permissioned recovery peers" },
  6720: { name: "UnauthorizedRecoveryPeerCreation", msg: "Unauthorized to create recovery peer on mainnet" },
};

/** Look up a human-readable error from an Anchor error code. */
export function getArciumError(code: number): ArciumError | null {
  return ARCIUM_ERRORS[code] ?? null;
}
