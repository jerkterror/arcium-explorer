import Client from "@triton-one/yellowstone-grpc";
import { ARCIUM_PROGRAM_ID } from "@/lib/constants";
import { processAccountUpdate } from "./account-processor";
import { createLogger } from "./logger";
import type { Network } from "@/types";
import { PublicKey } from "@solana/web3.js";

const log = createLogger("grpc");

export interface GrpcSubscriberConfig {
  endpoint: string;
  token?: string;
  network: Network;
}

export class GrpcSubscriber {
  private endpoint: string;
  private token: string | undefined;
  private network: Network;
  private running = false;
  private reconnectDelay = 1000;
  private readonly MAX_RECONNECT_DELAY = 60_000;
  private client: Client | null = null;

  constructor(config: GrpcSubscriberConfig) {
    this.endpoint = config.endpoint;
    this.token = config.token;
    this.network = config.network;
  }

  async start(): Promise<void> {
    this.running = true;
    log.info("gRPC subscriber starting", {
      endpoint: this.endpoint,
      network: this.network,
    });

    while (this.running) {
      try {
        await this.subscribe();
      } catch (error) {
        if (!this.running) break;

        const msg = error instanceof Error ? error.message : String(error);
        log.error("gRPC subscription error, reconnecting", {
          error: msg,
          retryInMs: this.reconnectDelay,
        });
        await this.sleep(this.reconnectDelay);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.MAX_RECONNECT_DELAY
        );
      }
    }

    log.info("gRPC subscriber stopped");
  }

  private ensureClient(): Client {
    if (!this.client) {
      this.client = new Client(this.endpoint, this.token, {
        grpcHttp2KeepAliveInterval: 120_000,
        grpcKeepAliveTimeout: 10_000,
        grpcKeepAliveWhileIdle: true,
      });
    }
    return this.client;
  }

  private async subscribe(): Promise<void> {
    const client = this.ensureClient();

    await client.connect();
    log.info("gRPC connected", { endpoint: this.endpoint });

    const stream = await client.subscribe();

    // Subscribe to all Arcium program accounts
    const subscribeRequest = {
      accounts: {
        arcium: {
          account: [],
          owner: [ARCIUM_PROGRAM_ID],
          filters: [],
        },
      },
      slots: {},
      transactions: {},
      transactionsStatus: {},
      blocks: {},
      blocksMeta: {},
      entry: {},
      commitment: 1, // CONFIRMED
      accountsDataSlice: [],
    };

    stream.write(subscribeRequest);
    log.info("gRPC subscription active", { owner: ARCIUM_PROGRAM_ID });

    // Reset reconnect delay on successful subscription
    this.reconnectDelay = 1000;

    let accountsProcessed = 0;

    await new Promise<void>((resolve, reject) => {
      stream.on("data", async (update: Record<string, unknown>) => {
        try {
          if (update.account) {
            const accountUpdate = update.account as {
              account: {
                pubkey: Uint8Array;
                data: Uint8Array;
                owner: Uint8Array;
              };
              slot: string;
              isStartup: boolean;
            };

            const info = accountUpdate.account;
            if (!info?.data || !info?.pubkey) return;

            const address = new PublicKey(info.pubkey).toBase58();

            await processAccountUpdate({
              address,
              data: info.data,
              network: this.network,
            });

            accountsProcessed++;
            if (accountsProcessed % 100 === 0) {
              log.info("gRPC accounts processed", {
                count: accountsProcessed,
                network: this.network,
              });
            }
          }
        } catch (error) {
          log.error("Error processing gRPC update", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });

      stream.on("error", (err: Error) => {
        log.error("gRPC stream error", { error: err.message });
        this.client = null;
        reject(err);
      });

      stream.on("end", () => {
        log.debug("gRPC stream ended");
        resolve();
      });

      stream.on("close", () => {
        log.debug("gRPC stream closed");
        resolve();
      });
    });
  }

  stop(): void {
    this.running = false;
    log.info("gRPC subscriber stop requested");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
