/**
 * Mexican peso ↔ Stellar remittance flow via Etherfuse SPEI rails.
 *
 * Default network: testnet (Etherfuse sandbox `api.sand.etherfuse.com`).
 * The `customer_id` and `bank_account_id` Etherfuse generates are PERMANENTLY
 * bound to your wallet at KYC time — this script persists them via the agent's
 * KV store so reruns don't break.
 */
import { Keypair, Networks } from "@stellar/stellar-sdk";
import {
  StellarAgentKit,
  KeypairWallet,
  executeAction,
} from "@stellar-agent-kit/core";
import { StellarAssetPlugin } from "@stellar-agent-kit/plugin-asset";
import { AnchorPlugin } from "@stellar-agent-kit/plugin-anchor";
import { DataPlugin } from "@stellar-agent-kit/plugin-data";

const SECRET = process.env.STELLAR_SECRET_KEY;
const ETHERFUSE_API_KEY = process.env.ETHERFUSE_API_KEY;
const USER_EMAIL = process.env.USER_EMAIL ?? "demo@example.com";

if (!SECRET) throw new Error("STELLAR_SECRET_KEY required");
if (!ETHERFUSE_API_KEY) throw new Error("ETHERFUSE_API_KEY required (testnet: https://devnet.etherfuse.com/ramp)");
Keypair.fromSecret(SECRET);

const wallet = new KeypairWallet(SECRET);
const agent = new StellarAgentKit(wallet, {
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: Networks.TESTNET,
  apiKeys: {
    etherfuse: ETHERFUSE_API_KEY,
    etherfuseNetwork: "testnet",
    anchorNetwork: "testnet",
  },
})
  .use(StellarAssetPlugin)
  .use(AnchorPlugin)
  .use(DataPlugin);

console.log(`Wallet: ${agent.wallet.publicKey}`);

// 1. Create / look up customer (idempotent — IDs persist in KV)
const createCustomer = agent.actions.find((a) => a.name === "ANCHOR_CREATE_CUSTOMER")!;
const customer = await executeAction(createCustomer, agent, {
  provider: "etherfuse",
  email: USER_EMAIL,
  country: "MX",
});
console.log("\nCustomer:", customer);

// 2. Get KYC URL — user must complete KYC at this URL before quoting / ordering
const getKycUrl = agent.actions.find((a) => a.name === "ANCHOR_GET_KYC_URL")!;
if (typeof customer.id === "string") {
  const kycUrl = await executeAction(getKycUrl, agent, {
    provider: "etherfuse",
    customerId: customer.id,
  });
  console.log("\nKYC URL:", kycUrl);
  console.log("→ Send your user to this URL to complete KYC.");
  console.log("→ Once KYC is approved, rerun this script with the QUOTE step uncommented.");
}

// 3. (After KYC approved) Get a quote: 1000 MXN → CETES
// const getQuote = agent.actions.find((a) => a.name === "ANCHOR_GET_QUOTE")!;
// const quote = await executeAction(getQuote, agent, {
//   provider: "etherfuse",
//   fromCurrency: "MXN",
//   toCurrency: "CETES",
//   fromAmount: "1000",
//   customerId: customer.id,
// });
// console.log("\nQuote:", quote);

// 4. Create on-ramp order (returns SPEI CLABE the user wires fiat to)
// const createOnRamp = agent.actions.find((a) => a.name === "ANCHOR_CREATE_ONRAMP")!;
// const order = await executeAction(createOnRamp, agent, {
//   provider: "etherfuse",
//   customerId: customer.id,
//   quoteId: quote.id,
// });
// console.log("\nOrder + payment instructions:", order);
