# AP2 Example

Minimal implementation of [AP2 (Agent Payments Protocol)](https://github.com/google-agentic-commerce/AP2) mandate verification.

Built to understand AP2 from the inside. Implements a merchant that verifies signed mandates, and an agent that creates and presents them.

## What's here

- `src/server.ts` — AP2 merchant (TicketShop), verifying intent and cart mandates with EIP-712 signatures
- `src/client.ts` — AI agent that signs an intent mandate and presents it for verification
- `src/types.ts` — AP2 types (IntentMandate, CartMandate, SpendingConstraint, etc.)
- `OBSERVATIONS.md` — What we learned implementing this from scratch

## Run it

```bash
npm install

# Terminal 1: start the merchant server
npm run server

# Terminal 2: run the agent
npm run client
```

## Key observations

See [OBSERVATIONS.md](./OBSERVATIONS.md) for the full findings. The most important:

**AP2 is the authorization layer, not the payment layer.** It proves an agent is allowed to spend, but doesn't move money. Settlement happens on a separate rail (x402, card, bank). This separation is by design — AP2 mandates work with any payment method.

**The cross-merchant budget gap.** AP2 mandates include a budget (`budgetTotal`), but verification is stateless on the merchant side. Each merchant verifies independently. If an agent presents the same mandate to two merchants, neither knows about the other's verification. Cumulative budget tracking requires an external verifier.

## Protocol

AP2 defines cryptographic mandates (EIP-712 signed) that authorize agent spending. Two types: Intent Mandates (pre-authorized autonomous spending) and Cart Mandates (user approves a specific cart). This implementation covers both.

Compare with [acp-example](https://github.com/goodmeta/acp-example) (REST checkout), [ucp-example](https://github.com/goodmeta/ucp-example) (MCP checkout), [mpp-example](https://github.com/goodmeta/mpp-example) (charge intent), and [x402-example](https://github.com/goodmeta/x402-example) (pay-per-request).
