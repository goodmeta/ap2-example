// AP2 Merchant Server — TicketShop
// Implements AP2 (Agent Payments Protocol) mandate verification
// Spec: github.com/google-agentic-commerce/AP2
//
// AP2 is the AUTHORIZATION layer — it defines how users grant agents
// spending authority via cryptographically signed mandates.
// Settlement happens on a separate rail (x402, card, bank).
//
// Two mandate types:
//   Intent Mandate — user pre-authorizes autonomous spending
//   Cart Mandate — merchant proposes cart, user approves specific purchase
//
// Endpoints:
//   GET  /catalog                   — product catalog
//   POST /verify/intent             — verify intent mandate + constraints
//   POST /verify/cart               — verify cart mandate signatures
//   POST /cart/create               — merchant creates cart mandate for signing

import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { logger } from "hono/logger"
import { verifyTypedData, type Address } from "viem"
import type { IntentMandate, CartMandate, CartItem, VerifyResult } from "./types.js"

const PORT = Number(process.env.PORT ?? 3000)
const MERCHANT_ID = "ticketshop"

// EIP-712 domain (must match signer)
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

const CART_MANDATE_TYPES = {
  CartMandate: [
    { name: "id", type: "string" },
    { name: "merchantId", type: "string" },
    { name: "total", type: "string" },
    { name: "currency", type: "string" },
    { name: "expiresAt", type: "string" },
  ],
} as const

// Product catalog
const CATALOG: CartItem[] = [
  {
    id: "token2049-vip",
    name: "TOKEN2049 Singapore VIP Pass",
    quantity: 1,
    unitPrice: "29900",
    currency: "USD",
  },
]

const TAX_RATE = 0.09
const TOTAL_CENTS = Math.round(29900 * (1 + TAX_RATE)) // 32591

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
}

const app = new Hono()
app.use(logger())

// GET /catalog
app.get("/catalog", (c) => {
  return c.json({
    merchant: { id: MERCHANT_ID, name: "TicketShop", url: "https://ticketshop.example" },
    items: CATALOG,
    total: TOTAL_CENTS.toString(),
    currency: "USD",
    paymentRails: ["x402", "card"],
  })
})

// POST /verify/intent — verify an intent mandate and check constraints
app.post("/verify/intent", async (c) => {
  const { mandate, transaction } = await c.req.json<{
    mandate: IntentMandate
    transaction: { amount: string; merchant: string }
  }>()

  // 1. Verify EIP-712 signature
  if (!mandate.userSignature) {
    return c.json({ valid: false, error: "Missing userSignature" }, 400)
  }

  try {
    const sigValid = await verifyTypedData({
      address: mandate.user.id as Address,
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
      signature: mandate.userSignature as `0x${string}`,
    })

    if (!sigValid) {
      return c.json({ valid: false, error: "Invalid signature" } satisfies VerifyResult)
    }
  } catch {
    return c.json({ valid: false, error: "Signature verification failed" } satisfies VerifyResult)
  }

  // 2. Temporal check
  const now = new Date()
  if (new Date(mandate.validFrom) > now) {
    return c.json({ valid: false, error: `Not yet valid (from ${mandate.validFrom})` } satisfies VerifyResult)
  }
  if (new Date(mandate.validUntil) < now) {
    return c.json({ valid: false, error: "Mandate expired" } satisfies VerifyResult)
  }

  // 3. Constraint checks
  const amount = parseInt(transaction.amount, 10)
  const maxAmount = parseInt(mandate.constraints.maxAmount, 10)
  if (amount > maxAmount) {
    return c.json({ valid: false, error: `Amount ${amount} exceeds max ${maxAmount}` } satisfies VerifyResult)
  }

  // Merchant allowlist
  if (mandate.constraints.allowedMerchants?.length) {
    if (!mandate.constraints.allowedMerchants.includes(transaction.merchant)) {
      return c.json({ valid: false, error: `Merchant ${transaction.merchant} not allowed` } satisfies VerifyResult)
    }
  }

  // Budget check (stateless — caller tracks cumulative spend)
  const spent = parseInt(mandate.budgetSpent, 10)
  const total = parseInt(mandate.budgetTotal, 10)
  if (spent + amount > total) {
    return c.json({
      valid: false,
      error: `Budget exceeded: ${spent} + ${amount} > ${total}`,
    } satisfies VerifyResult)
  }

  console.log(`[AP2] Intent mandate verified: ${mandate.id} — $${(amount / 100).toFixed(2)}`)
  return c.json({
    valid: true,
    mandate: {
      id: mandate.id,
      remainingBudget: (total - spent - amount).toString(),
    },
  })
})

// POST /cart/create — merchant creates a cart mandate for user signing
app.post("/cart/create", (c) => {
  const cartMandate: CartMandate = {
    type: "cart-mandate",
    version: "0.1.0",
    id: generateId("cart"),
    merchant: { id: MERCHANT_ID, name: "TicketShop", url: "https://ticketshop.example" },
    agent: { id: "" },  // filled by caller
    user: { id: "" },   // filled by caller
    cart: {
      items: CATALOG,
      total: TOTAL_CENTS.toString(),
      currency: "USD",
    },
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    paymentRails: ["x402", "card"],
  }

  console.log(`[AP2] Cart mandate created: ${cartMandate.id}`)
  return c.json(cartMandate, 201)
})

// POST /verify/cart — verify a signed cart mandate
app.post("/verify/cart", async (c) => {
  const { mandate } = await c.req.json<{ mandate: CartMandate }>()

  if (!mandate.userSignature) {
    return c.json({ valid: false, error: "Missing userSignature" }, 400)
  }

  try {
    const sigValid = await verifyTypedData({
      address: mandate.user.id as Address,
      domain: AP2_DOMAIN,
      types: CART_MANDATE_TYPES,
      primaryType: "CartMandate",
      message: {
        id: mandate.id,
        merchantId: mandate.merchant.id,
        total: mandate.cart.total,
        currency: mandate.cart.currency,
        expiresAt: mandate.expiresAt,
      },
      signature: mandate.userSignature as `0x${string}`,
    })

    if (!sigValid) {
      return c.json({ valid: false, error: "Invalid user signature" } satisfies VerifyResult)
    }
  } catch {
    return c.json({ valid: false, error: "Signature verification failed" } satisfies VerifyResult)
  }

  // Temporal check
  if (new Date(mandate.expiresAt) < new Date()) {
    return c.json({ valid: false, error: "Cart mandate expired" } satisfies VerifyResult)
  }

  console.log(`[AP2] Cart mandate verified: ${mandate.id} — $${(parseInt(mandate.cart.total, 10) / 100).toFixed(2)}`)
  return c.json({ valid: true })
})

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[AP2] TicketShop mandate server running on http://localhost:${PORT}`)
  console.log(`[AP2] Merchant: ${MERCHANT_ID}`)
  console.log(`[AP2] Mandate types: intent-mandate, cart-mandate`)
})
