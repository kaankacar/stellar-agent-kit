import type { BaseWallet, SignTransactionOpts } from "../types/wallet";

interface FreighterApi {
  isConnected(): Promise<{ isConnected: boolean }>;
  getAddress(): Promise<{ address: string }>;
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string; address?: string },
  ): Promise<{ signedTxXdr: string; signerAddress: string }>;
  signAuthEntry?(
    entryXdr: string,
    opts: { networkPassphrase: string; address?: string },
  ): Promise<{ signedAuthEntry: string; signerAddress: string }>;
  signMessage?(
    message: string,
    opts: { address?: string },
  ): Promise<{ signedMessage: string; signerAddress: string }>;
}

/**
 * Browser-only wallet that delegates to the Freighter extension via
 * `@stellar/freighter-api`. Pulled lazily so importers don't need
 * the dep installed when running on the server.
 */
export class FreighterWallet implements BaseWallet {
  public readonly publicKey: string;
  private api: FreighterApi;

  private constructor(publicKey: string, api: FreighterApi) {
    this.publicKey = publicKey;
    this.api = api;
  }

  static async connect(): Promise<FreighterWallet> {
    const mod = (await import("@stellar/freighter-api")) as unknown as FreighterApi;
    const { isConnected } = await mod.isConnected();
    if (!isConnected) throw new Error("Freighter is not installed or not connected");
    const { address } = await mod.getAddress();
    return new FreighterWallet(address, mod);
  }

  async signTransaction(xdrString: string, opts: SignTransactionOpts): Promise<string> {
    const { signedTxXdr } = await this.api.signTransaction(xdrString, {
      networkPassphrase: opts.networkPassphrase,
      address: opts.accountToSign ?? opts.address ?? this.publicKey,
    });
    return signedTxXdr;
  }
}
