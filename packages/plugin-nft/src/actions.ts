import { z } from "zod";
import { nativeToScVal } from "@stellar/stellar-sdk";
import type { Action } from "@stellar-agent-kit/core";
import { addressArg, readNftMethod, u32Arg, writeNftMethod } from "./utils";

const contractSchema = z.object({
  contractId: z.string().describe("C... contract id of an OZ NFT contract"),
});

export const nftMint: Action = {
  name: "NFT_MINT",
  similes: ["mint nft", "create nft"],
  description:
    "Mint a new NFT to a recipient on a deployed OpenZeppelin Stellar Non-Fungible contract that uses sequential minting. Requires the agent's wallet to be the contract's authorized minter.",
  examples: [
    [
      {
        input: { contractId: "C...", to: "G..." },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "",
      },
    ],
  ],
  schema: contractSchema.extend({
    to: z.string().describe("Recipient address (G... or C... smart account)"),
  }),
  handler: async (agent, input) =>
    writeNftMethod(agent, input.contractId, "mint", [addressArg(input.to)]),
};

export const nftTransfer: Action = {
  name: "NFT_TRANSFER",
  similes: ["transfer nft", "send nft"],
  description: "Transfer an NFT to another address. The current owner must authorize.",
  examples: [
    [
      {
        input: { contractId: "C...", from: "G...", to: "G...", tokenId: 1 },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "",
      },
    ],
  ],
  schema: contractSchema.extend({
    from: z.string(),
    to: z.string(),
    tokenId: z.number().int().nonnegative(),
  }),
  handler: async (agent, input) =>
    writeNftMethod(agent, input.contractId, "transfer", [
      addressArg(input.from),
      addressArg(input.to),
      u32Arg(input.tokenId),
    ]),
};

export const nftApprove: Action = {
  name: "NFT_APPROVE",
  similes: ["approve nft transfer", "set nft operator"],
  description:
    "Approve a third party to transfer a specific NFT on behalf of the owner. The contract owner / current holder must authorize.",
  examples: [
    [
      {
        input: { contractId: "C...", approver: "G...", approved: "G...", tokenId: 1 },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "",
      },
    ],
  ],
  schema: contractSchema.extend({
    approver: z.string(),
    approved: z.string(),
    tokenId: z.number().int().nonnegative(),
    liveUntilLedger: z.number().int().positive().optional(),
  }),
  handler: async (agent, input) => {
    const { rpc } = await import("@stellar/stellar-sdk");
    const liveUntil =
      input.liveUntilLedger ??
      (await agent.rpcServer.getLatestLedger().then((r) => r.sequence + 100_000));
    void rpc; // ensure tree-shaking sees the import
    return writeNftMethod(agent, input.contractId, "approve", [
      addressArg(input.approver),
      addressArg(input.approved),
      u32Arg(input.tokenId),
      u32Arg(liveUntil),
    ]);
  },
};

export const nftBurn: Action = {
  name: "NFT_BURN",
  similes: ["burn nft", "destroy nft"],
  description:
    "Burn an NFT. Only available on contracts that implement the Burnable trait. Owner must authorize.",
  examples: [
    [
      {
        input: { contractId: "C...", from: "G...", tokenId: 1 },
        output: { hash: "...", status: "SUCCESS" },
        explanation: "",
      },
    ],
  ],
  schema: contractSchema.extend({
    from: z.string(),
    tokenId: z.number().int().nonnegative(),
  }),
  handler: async (agent, input) =>
    writeNftMethod(agent, input.contractId, "burn", [addressArg(input.from), u32Arg(input.tokenId)]),
};

export const nftBalanceOf: Action = {
  name: "NFT_BALANCE_OF",
  similes: ["nft count", "how many nfts"],
  description: "Read how many NFTs an address holds on a given NFT contract.",
  examples: [
    [
      {
        input: { contractId: "C...", owner: "G..." },
        output: { value: 3 },
        explanation: "",
      },
    ],
  ],
  schema: contractSchema.extend({ owner: z.string() }),
  handler: async (agent, input) =>
    readNftMethod(agent, input.contractId, "balance", [addressArg(input.owner)]),
};

export const nftOwnerOf: Action = {
  name: "NFT_OWNER_OF",
  similes: ["who owns nft", "nft holder"],
  description: "Read the current owner of an NFT.",
  examples: [
    [
      { input: { contractId: "C...", tokenId: 1 }, output: { value: "G..." }, explanation: "" },
    ],
  ],
  schema: contractSchema.extend({ tokenId: z.number().int().nonnegative() }),
  handler: async (agent, input) =>
    readNftMethod(agent, input.contractId, "owner_of", [u32Arg(input.tokenId)]),
};

export const nftTokenUri: Action = {
  name: "NFT_TOKEN_URI",
  similes: ["nft uri", "nft metadata"],
  description: "Read the metadata URI for a specific NFT token id.",
  examples: [
    [
      {
        input: { contractId: "C...", tokenId: 1 },
        output: { value: "https://..." },
        explanation: "",
      },
    ],
  ],
  schema: contractSchema.extend({ tokenId: z.number().int().nonnegative() }),
  handler: async (agent, input) =>
    readNftMethod(agent, input.contractId, "token_uri", [u32Arg(input.tokenId)]),
};

export const nftRoyaltyInfo: Action = {
  name: "NFT_ROYALTY_INFO",
  similes: ["royalty info", "erc2981 royalty", "nft royalty"],
  description:
    "Read royalty_info(token_id, sale_price) from an NFT contract that implements the OpenZeppelin NonFungibleRoyalties trait (ERC-2981 style). Returns the royalty receiver and the royalty amount (i128) for the given sale price. Read-only — uses simulation.",
  examples: [
    [
      {
        input: { contractId: "C...", tokenId: 1, salePrice: "10000000" },
        output: { receiver: "G...", royaltyAmount: "1000000" },
        explanation: "Get royalty owed on a 10 USDC sale (10% royalty -> 1 USDC)",
      },
    ],
  ],
  schema: contractSchema.extend({
    tokenId: z.number().int().nonnegative(),
    salePrice: z
      .string()
      .describe("Sale price in atomic units (i128 string, e.g. '10000000' for 10 USDC at 6 decimals)"),
  }),
  handler: async (agent, input) => {
    const res = await readNftMethod(agent, input.contractId, "royalty_info", [
      u32Arg(input.tokenId),
      nativeToScVal(BigInt(input.salePrice), { type: "i128" }),
    ]);
    if (res.error) {
      return { receiver: null, royaltyAmount: null, error: res.error };
    }
    // The contract returns a (Address, i128) tuple. scValToNative decodes
    // tuples to JS arrays.
    const value = res.value as unknown;
    if (Array.isArray(value) && value.length >= 2) {
      const [receiver, royaltyAmount] = value;
      return {
        receiver: typeof receiver === "string" ? receiver : String(receiver),
        royaltyAmount:
          typeof royaltyAmount === "bigint"
            ? royaltyAmount.toString()
            : royaltyAmount == null
              ? null
              : String(royaltyAmount),
      };
    }
    return { receiver: null, royaltyAmount: null, raw: value };
  },
};

export const nftCollectionInfo: Action = {
  name: "NFT_COLLECTION_INFO",
  similes: ["nft collection name", "nft symbol"],
  description: "Read the name and symbol of an NFT collection contract.",
  examples: [
    [
      {
        input: { contractId: "C..." },
        output: { name: "MyArt", symbol: "ART" },
        explanation: "",
      },
    ],
  ],
  schema: contractSchema,
  handler: async (agent, input) => {
    const [name, symbol] = await Promise.all([
      readNftMethod(agent, input.contractId, "name"),
      readNftMethod(agent, input.contractId, "symbol"),
    ]);
    return {
      name: name.value ?? null,
      symbol: symbol.value ?? null,
      nameError: name.error,
      symbolError: symbol.error,
    };
  },
};
