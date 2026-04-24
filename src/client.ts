// AP2 Agent Client — buys a conference ticket using a signed intent mandate
//
// Flow:
//   1. User creates and signs an IntentMandate (EIP-712)
//   2. Agent presents mandate to merchant for verification
//   3. Merchant verifies signature + constraints → approved
//   4. Settlement happens on a separate rail (not part of AP2)
//
// AP2 is the AUTHORIZATION layer — "who can spend what."
// It doesn't move money. It proves the agent is allowed to.

import { privateKeyToAccount } from "viem/accounts"
import type { IntentMandate } from "./types.js"

const BASE_URL = `http://localhost:${process.env.PORT ?? 3000}`

function log(step: string, data: unknown) {
  console.log(`\n${"─".repeat(60)}`)
  console.log(`STEP: ${step}`)
  console.log("─".repeat(60))
  console.log(JSON.stringify(data, null, 2))
}

const AP2_DOMAIN = { name: "AP2", version: "0.1.0" } as const

const INTENT_MANDATE_TYPES = {
  IntentMandate: [
    { name: "id", type: "string" },
    { name: "intent", type: "string" },
    { name: "maxAmount", type: "string" },
    { name: "currency", type: "string" },
    { name: "validUntil", type: "string" },
    { name: "budgetTotal", type: "string" },
  ],
} as const

async function buyTicket() {
  console.log("AP2 Agent — Buying TOKEN2049 VIP Pass")
  console.log("Protocol: Agent Payments Protocol (AP2)")
  console.log("Layer: Authorization (mandate verification)\n")

  // ── Step 1: User creates and signs an intent mandate ──────────────────
  // In production, the user does this in their wallet.
  // Here we simulate with a local private key.
  const userKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const
  const userAccount = privateKeyToAccount(userKey)

  const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const mandate: IntentMandate = {
    type: "intent-mandate",
    version: "0.1.0",
    id: `mandate_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
    user: { id: userAccount.address },
    agent: { id: "0xAgentAddress" },
    intent: "Buy conference tickets",
    constraints: {
      maxAmount: "50000",   // $500 per transaction
      currency: "USD",
      allowedMerchants: ["ticketshop"],
    },
    validFrom: new Date().toISOString(),
    validUntil,
    budgetTotal: "100000",  // $1000 total budget
    budgetSpent: "0",
  }

  // Sign with EIP-712
  const signature = await userAccount.signTypedData({
    domain: AP2_DOMAIN,
    types: INTENT_MANDATE_TYPES,
    primaryType: "IntentMandate",
    message: {
      id: mandate.id,
      intent: mandate.intent,
      maxAmount: mandate.constraints.maxAmount,
      currency: mandate.constraints.currency,
      validUntil: mandate.validUntil,
      budgetTotal: mandate.budgetTotal,
    },
  })

  mandate.userSignature = signature

  log("1. User signs intent mandate (EIP-712)", {
    mandateId: mandate.id,
    user: mandate.user.id,
    intent: mandate.intent,
    budget: `$${(parseInt(mandate.budgetTotal) / 100).toFixed(2)}`,
    maxPerTx: `$${(parseInt(mandate.constraints.maxAmount) / 100).toFixed(2)}`,
    allowedMerchants: mandate.constraints.allowedMerchants,
    signaturePrefix: signature.slice(0, 20) + "...",
  })

  // OBSERVATION: The user signs a mandate ONCE. The agent can use it
  // for multiple purchases within the constraints. This is fundamentally
  // different from ACP's Allowance (per-session) or x402's permit (per-request).

  // ── Step 2: Agent presents mandate to merchant ────────────────────────
  const verifyRes = await fetch(`${BASE_URL}/verify/intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mandate,
      transaction: {
        amount: "32591", // $325.91 (ticket + tax)
        merchant: "ticketshop",
      },
    }),
  })
  const verifyResult = await verifyRes.json() as Record<string, unknown>

  log("2. Merchant verifies mandate", verifyResult)

  // OBSERVATION: AP2 verification is stateless on the merchant side.
  // The merchant checks: signature valid? constraints met? budget remaining?
  // But the merchant doesn't TRACK cumulative spend — that's the user's
  // or a verifier's responsibility. If the agent presents the same mandate
  // to two merchants, each verifies independently. Neither knows about
  // the other. This is the cross-merchant budget gap.

  // ── Step 3: Settlement (separate rail — not AP2) ──────────────────────
  // AP2 stops at verification. The actual payment would happen via:
  // - x402 (ERC-20 permit on Base)
  // - Card (Stripe, Adyen)
  // - Bank transfer
  // AP2 proves authorization. Settlement is someone else's problem.

  console.log("\n" + "═".repeat(60))
  console.log("MANDATE VERIFIED (AP2)")
  console.log("═".repeat(60))
  console.log(`Mandate:    ${mandate.id}`)
  console.log(`Amount:     $325.91 USD`)
  console.log(`Valid:      ${verifyResult["valid"]}`)
  console.log(`Remaining:  $${(parseInt((verifyResult["mandate"] as Record<string, string>)?.["remainingBudget"] ?? "0") / 100).toFixed(2)}`)
  console.log(`\nSettlement would happen on a separate rail (x402, card, etc.)`)
  console.log("See OBSERVATIONS.md for implementation notes.")
}

buyTicket().catch((err) => {
  console.error("Agent failed:", err)
  process.exit(1)
})
