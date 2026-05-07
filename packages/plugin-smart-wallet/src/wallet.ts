import type { BaseWallet, SignTransactionOpts } from "@stellar-agent-kit/core";

/**
 * Structural shape of the smart-account-kit signer surface we depend on.
 * We don't import the package directly — consumers pass an instance and
 * we duck-type against this interface so we stay decoupled from version churn.
 */
export interface SmartAccountSigner {
  /** Stellar contract address (C...) of the smart account. */
  contractId: string;
  /**
   * Sign a transaction envelope (XDR string) by appending the smart-account
   * authorization entries that the contract requires.
   */
  signTransaction(xdr: string, opts: { networkPassphrase: string }): Promise<string>;
}

export class SmartAccountWallet implements BaseWallet {
  public readonly publicKey: string;
  private signer: SmartAccountSigner;

  constructor(signer: SmartAccountSigner) {
    this.signer = signer;
    this.publicKey = signer.contractId;
  }

  static fromKit(signer: SmartAccountSigner): SmartAccountWallet {
    return new SmartAccountWallet(signer);
  }

  async signTransaction(xdrString: string, opts: SignTransactionOpts): Promise<string> {
    return this.signer.signTransaction(xdrString, {
      networkPassphrase: opts.networkPassphrase,
    });
  }
}
