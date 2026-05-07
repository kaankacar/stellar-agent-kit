import {
  Keypair,
  TransactionBuilder,
  Transaction,
  FeeBumpTransaction,
  authorizeEntry,
  xdr,
} from "@stellar/stellar-sdk";
import type { BaseWallet, SignTransactionOpts } from "../types/wallet";

export class KeypairWallet implements BaseWallet {
  private keypair: Keypair;
  public readonly publicKey: string;

  constructor(secretKey: string) {
    this.keypair = Keypair.fromSecret(secretKey);
    this.publicKey = this.keypair.publicKey();
  }

  async signTransaction(xdrString: string, opts: SignTransactionOpts): Promise<string> {
    const tx = TransactionBuilder.fromXDR(xdrString, opts.networkPassphrase) as
      | Transaction
      | FeeBumpTransaction;
    tx.sign(this.keypair);
    return tx.toXDR();
  }

  async signAuthEntry(
    entry: xdr.SorobanAuthorizationEntry,
    opts: SignTransactionOpts,
  ): Promise<xdr.SorobanAuthorizationEntry> {
    // ledgersToLive: best practice is current ledger + a small buffer; consumer can override
    // by signing manually if they need fine control.
    const validUntilLedger = (Date.now() / 5) | 0; // very rough; Soroban auth entries take a ledger seq
    return authorizeEntry(entry, this.keypair, validUntilLedger, opts.networkPassphrase);
  }

  async signMessage(message: Uint8Array | string): Promise<Uint8Array> {
    const data = typeof message === "string" ? new TextEncoder().encode(message) : message;
    return this.keypair.sign(Buffer.from(data));
  }
}
