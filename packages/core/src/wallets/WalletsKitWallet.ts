import type { BaseWallet, SignTransactionOpts } from "../types/wallet";

interface WalletsKitApi {
  getAddress(): Promise<{ address: string }>;
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string; address?: string },
  ): Promise<{ signedTxXdr: string; signerAddress: string }>;
}

/**
 * Wraps `@creit.tech/stellar-wallets-kit` so callers can connect to
 * any wallet the kit supports (Freighter, xBull, Lobstr, Albedo, ...).
 *
 * Construct via `WalletsKitWallet.attach(kit)` after the consumer has
 * called `kit.openModal(...)` and the user has selected a wallet.
 */
export class WalletsKitWallet implements BaseWallet {
  public readonly publicKey: string;
  private kit: WalletsKitApi;

  private constructor(publicKey: string, kit: WalletsKitApi) {
    this.publicKey = publicKey;
    this.kit = kit;
  }

  static async attach(kit: WalletsKitApi): Promise<WalletsKitWallet> {
    const { address } = await kit.getAddress();
    return new WalletsKitWallet(address, kit);
  }

  async signTransaction(xdrString: string, opts: SignTransactionOpts): Promise<string> {
    const { signedTxXdr } = await this.kit.signTransaction(xdrString, {
      networkPassphrase: opts.networkPassphrase,
      address: opts.accountToSign ?? opts.address ?? this.publicKey,
    });
    return signedTxXdr;
  }
}
