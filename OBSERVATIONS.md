# AP2 Implementation Observations

Protocol: Agent Payments Protocol (AP2)  
Spec: github.com/google-agentic-commerce/AP2  
Maintainers: Google  
Built: 2026-04-24

---

## 1. AP2 Is Authorization, Not Payment

AP2 doesn't move money. It proves an agent is authorized to spend. The mandate is a signed permission slip: "this agent can spend up to $X at these merchants until this date." Settlement happens elsewhere (x402, card, bank).

This is the right separation of concerns. Authorization and settlement are different problems with different trust models. AP2 handles the first; it deliberately doesn't touch the second.

## 2. Intent Mandates Are the Most Powerful Authorization Model

An intent mandate is signed once and used for multiple purchases within constraints. The user signs: "this agent can spend up to $500 per transaction, $1000 total, only at ticketshop and coffeeshop, until Dec 31."

Compare to ACP Allowance (per-session, per-merchant) or x402 permits (per-request). AP2 mandates are the broadest authorization — one signature covers many transactions.

## 3. Verification Is Stateless — That's the Gap

The merchant verifies: signature valid? Constraints met? Budget remaining? But the merchant doesn't TRACK cumulative spend. `budgetSpent` is in the mandate, but it's the agent's self-reported value.

If an agent presents the same mandate to two merchants with `budgetSpent: "0"`, both verify successfully. Neither knows about the other. The total spend exceeds the budget, and nobody detects it.

This is the cross-merchant budget gap. AP2 defines the budget. Nobody enforces it across merchants. That requires an external verifier.

## 4. EIP-712 Signatures Work Well for This

EIP-712 typed data signing is the right choice for mandates. The signature is human-readable (users can see what they're signing in MetaMask), verifiable without on-chain state, and composable with existing Ethereum tooling.

## 5. Cart vs Intent: Two Models for Different Trust Levels

- **Intent mandate**: user pre-authorizes, agent acts autonomously. Higher trust, more flexibility.
- **Cart mandate**: merchant proposes, user approves specific purchase. Lower trust, more control.

In practice, intent mandates are what agents need (they can't ask for approval on every purchase). Cart mandates are a fallback for high-value transactions where user confirmation is required.
