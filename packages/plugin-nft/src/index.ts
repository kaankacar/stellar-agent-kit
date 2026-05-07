import type { Plugin } from "@stellar-agent-kit/core";
import {
  nftMint,
  nftTransfer,
  nftApprove,
  nftBurn,
  nftBalanceOf,
  nftOwnerOf,
  nftTokenUri,
  nftCollectionInfo,
  nftRoyaltyInfo,
} from "./actions";

export const NftPlugin: Plugin = {
  name: "stellar-nft",
  methods: {},
  actions: [
    nftMint,
    nftTransfer,
    nftApprove,
    nftBurn,
    nftBalanceOf,
    nftOwnerOf,
    nftTokenUri,
    nftCollectionInfo,
    nftRoyaltyInfo,
  ],
  initialize() {},
};

export default NftPlugin;
export {
  nftMint,
  nftTransfer,
  nftApprove,
  nftBurn,
  nftBalanceOf,
  nftOwnerOf,
  nftTokenUri,
  nftCollectionInfo,
  nftRoyaltyInfo,
};
