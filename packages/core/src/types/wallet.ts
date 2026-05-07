import type { xdr } from "@stellar/stellar-sdk";

export interface SignTransactionOpts {
  networkPassphrase: string;
  accountToSign?: string;
  address?: string;
}

export interface BaseWallet {
  readonly publicKey: string;

  signTransaction(xdrString: string, opts: SignTransactionOpts): Promise<string>;

  signAuthEntry?(
    entry: xdr.SorobanAuthorizationEntry,
    opts: SignTransactionOpts,
  ): Promise<xdr.SorobanAuthorizationEntry>;

  signMessage?(message: Uint8Array | string): Promise<Uint8Array | string>;
}
