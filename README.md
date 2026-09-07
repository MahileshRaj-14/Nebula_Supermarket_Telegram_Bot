# Supermarket Ops Agent 🛒🤖

An AI-powered conversational supermarket and kirana-store operations manager that operates entirely through **Telegram**. "The chat is the product."

## 1. Project Overview

Supermarket Ops Agent allows shop owners to naturally manage store inventory, multi-item billing drafts, customer Khata credit ledgers, sales analytics, and generate professional PDF tax invoices and PowerPoint performance decks directly within Telegram chat.

### Key Capabilities
- **Natural Language Interaction**: Speak naturally to inquire about stock, bill items, check balances, or record payments.
- **Transactional Oversell Protection**: Atomic database transactions prevent negative inventory.
- **Deterministic GST System**: GST rates (0%, 5%, 12%, 18%) and CGST/SGST splits are calculated in TypeScript code using integer paise arithmetic (no LLM hallucination).
- **Khata Credit Ledger**: Manage customer credit balances, record repayments, and view statement history.
- **Document Generation**: Instant delivery of PDF Tax Invoices (PDFKit) and 6-slide PowerPoint Sales Analysis decks (PptxGenJS).
- **Persistent Preferences**: Store settings (e.g. payment preferences, shop name) that survive `/new` session resets.
- **Update Idempotency**: Prevents duplicate Telegram update processing.

---

## 2. Architecture

```
  Telegram App
      ↓
    grammY (Bot Framework)
      ↓
ProcessedUpdate (Idempotency Middleware)
      ↓
  ToolLoopAgent (Vercel AI SDK / OpenAI)
      ↓
  Agent Tools (Zod Validated)
  ├── Inventory
  ├── Billing
  ├── Khata / Credit
  ├── Analytics
  ├── Documents (PDF & PPTX)
  └── Preferences
      ↓
Business Logic Services (Deterministic Rules & GST)
      ↓
Prisma ORM (Transactions & Safety)
      ↓
SQLite File Database (dev.db) / PostgreSQL
```

---

## 3. Agent Loop & Harness

### Why Vercel AI SDK (`ToolLoopAgent`)?
We use Vercel AI SDK's `generateText` with `maxSteps: 10`. Rather than using a complex state-machine or hardcoded intent router, the agent operates in an autonomous control loop:

1. **OBSERVE**: Read incoming natural language message from Telegram.
2. **REASON**: Determine required tool calls based on Zod input schemas and tool descriptions.
3. **ACT**: Execute deterministic business logic services via tools.
4. **RECEIVE TOOL RESULT**: Inspect tool output (e.g. stock level, draft bill update, error message).
5. **REASON AGAIN**: Determine if additional steps (or document generation) are needed.
6. **RESPOND**: Send structured, friendly natural language response and deliver any generated files via Telegram.

---

## 4. Database & Storage Strategy

- **ORM**: Prisma ORM with strongly typed schema.
- **Standalone Local Storage**: SQLite (`file:./dev.db`) is configured so the project runs immediately without requiring an external database server connection.
- **PostgreSQL Production Ready**: To switch to PostgreSQL for production deployment, simply update `provider = "postgresql"` in `prisma/schema.prisma` and provide `DATABASE_URL`.

---

## 5. Business Rules & Guardrails

### Oversell Protection
All billing finalization runs inside a database transaction (`prisma.$transaction`):
1. Lock and verify draft bill items.
2. Check `product.quantity >= requestedQuantity` for every line item.
3. Reject transaction with error if stock is insufficient.
4. Decrement stock atomically only upon finalization.

### GST Calculation
Intra-state GST rules are enforced deterministically:
- `taxableValuePaise = Math.round(quantity * unitPrice * 100)`
- `gstAmountPaise = Math.round(taxableValuePaise * (gstRate / 100))`
- `cgst = gstAmount / 2`, `sgst = gstAmount / 2`
- Internal calculations use integer paise to prevent floating-point rounding errors.

### Idempotency
`ProcessedUpdate` table stores processed Telegram `update_id`s. Duplicate updates redelivered by Telegram are recognized and ignored cleanly.

---

## 6. How to Run Locally

### Prerequisites
- Node.js 18+ & npm

### Setup Steps
1. **Clone & Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env` and fill in your keys:
   ```env
   DATABASE_URL="file:./dev.db"
   OPENAI_API_KEY="your-openai-api-key"
   TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
   ```

3. **Database Migration & Seed**:
   ```bash
   npm run db:push
   npm run db:seed
   ```

4. **Run Unit & Integration Tests**:
   ```bash
   npm test
   ```

5. **Start Telegram Bot**:
   ```bash
   npm run dev
   ```

---

## 7. Demo Commands Flow

| Step | User Prompt Example | Action |
|------|--------------------|--------|
| 1. Stock Receiving | *"Add 20 packets of Maggi."* | Replenishes stock via `receive_stock`. |
| 2. Multi-item Bill | *"Bill 2 Atta and 3 Maggi for Ravi."* | Creates draft bill with items. |
| 3. Bill Editing | *"Actually remove one Maggi."* | Updates draft bill quantity. |
| 4. Oversell Test | *"Add 500 Maggi."* | Rejects transaction due to insufficient stock. |
| 5. Finalize Bill | *"Finalize with UPI."* | Executes transactional finalization & stock decrement. |
| 6. PDF Invoice | *"Send me the invoice."* | Generates and uploads PDF Tax Invoice. |
| 7. Khata Credit | *"Give Ravi ₹300 worth of groceries on credit."* | Adds credit transaction to Khata ledger. |
| 8. Khata Payment | *"Ravi paid ₹100."* | Records payment and updates balance. |
| 9. Analytics | *"Give me today's sales report."* | Fetches daily sales summary. |
| 10. PPTX Deck | *"Create the sales analysis deck."* | Generates and uploads 6-slide PowerPoint presentation. |
| 11. Preference Memory | *"Remember that I prefer UPI."* | Saves preference in database. |
| 12. Reset Session | `/new` | Resets draft session while keeping saved preferences. |

---

## 8. Deployment

To deploy to Railway or Render:
1. Connect GitHub repository.
2. Set environment variables (`DATABASE_URL`, `OPENAI_API_KEY`, `TELEGRAM_BOT_TOKEN`).
3. Build Command: `npm run build && npm run db:push`
4. Start Command: `npm start`
