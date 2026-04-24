// AP2 (Agent Payments Protocol) types
// Spec: github.com/google-agentic-commerce/AP2
// Authorization layer — cryptographic mandates for agent spending

export interface SpendingConstraint {
  maxAmount: string     // per-transaction max in minor units
  currency: string
  allowedMerchants?: string[]
  blockedMerchants?: string[]
  categories?: string[]
}

export interface IntentMandate {
  type: "intent-mandate"
  version: "0.1.0"
  id: string
  user: { id: string }       // user's address (signer)
  agent: { id: string }      // agent's address
  intent: string             // what the agent is authorized to do
  constraints: SpendingConstraint
  validFrom: string          // ISO 8601
  validUntil: string
  budgetTotal: string        // total budget in minor units
  budgetSpent: string        // how much has been used
  userSignature?: string     // EIP-712 signature
}

export interface CartItem {
  id: string
  name: string
  quantity: number
  unitPrice: string
  currency: string
}

export interface CartMandate {
  type: "cart-mandate"
  version: "0.1.0"
  id: string
  merchant: { id: string; name: string; url: string }
  agent: { id: string }
  user: { id: string }
  cart: {
    items: CartItem[]
    total: string
    currency: string
  }
  expiresAt: string
  paymentRails: string[]
  merchantSignature?: string
  userSignature?: string
}

export interface VerifyResult {
  valid: boolean
  error?: string
}
