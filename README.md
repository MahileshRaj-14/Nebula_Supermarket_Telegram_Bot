# Supermarket Ops Agent 

An AI-powered conversational supermarket and kirana-store operations manager that operates entirely through **Telegram**. *"The chat is the product."*

**Telegram Bot**: `@mahilesh_supermarket_ops_bot`

---
## SAMPLE SCREENSHOTS OF FEW IMPLEMENTATION (All the features are added this is just for sample)
<img width="722" height="1600" alt="image" src="https://github.com/user-attachments/assets/4e03cbdc-ce3f-4c67-a9df-9d1877262d50" />

## 1. Project Overview

Supermarket Ops Agent allows shop owners to naturally manage store inventory, multi-item billing drafts, customer Khata credit ledgers, sales analytics, and generate professional PDF tax invoices and PowerPoint performance decks directly within Telegram chat.

### Key Features
- **Natural Language Interaction**: Speak naturally to inquire about stock, bill items, check balances, or record payments.
- **AI Agent ToolLoop Harness**: Built with Vercel AI SDK (`ai` + `@ai-sdk/groq`) using `openai/gpt-oss-120b` for deterministic, autonomous tool calling.
- **Transactional Oversell Protection**: Atomic database transactions (`prisma.$transaction`) prevent negative inventory.
- **Deterministic GST System**: GST rates (0%, 5%, 12%, 18%) and CGST/SGST splits are calculated in TypeScript code using integer paise arithmetic (no LLM calculation hallucination).
- **Khata Credit Ledger**: Manage customer credit balances, record repayments, and view statement history.
- **Document Generation**: Instant delivery of PDF Tax Invoices (PDFKit) and 6-slide PowerPoint Sales Analysis decks (PptxGenJS).
- **Persistent Preferences**: Store settings (e.g. payment preferences, shop name) that survive `/new` session resets.
- **Update Idempotency**: Prevents duplicate Telegram update processing via `ProcessedUpdate` middleware.

---

## 2. Architecture

```
  Telegram App
      ↓
    grammY (Bot Framework)
      ↓
ProcessedUpdate (Idempotency Middleware)
      ↓
ToolLoopAgent (Vercel AI SDK / Groq - openai/gpt-oss-120b)
      ↓
  Agent Tools (Zod Validated)
  ├── Inventory (search_products, get_product, add_product, receive_stock, get_low_stock)
  ├── Billing (add_item_to_bill, remove_item_from_bill, get_draft_bill, finalize_bill)
  ├── Khata / Credit (add_credit, record_credit_payment, get_credit_balance)
  ├── Analytics (get_daily_sales, get_weekly_sales)
  ├── Documents (generate_invoice_pdf, generate_analysis_pptx)
  └── Preferences (set_preference, get_preference)
      ↓
Business Logic Services (Deterministic Rules & GST)
      ↓
Prisma ORM (Transactions & Safety)
      ↓
SQLite File Database (dev.db) / PostgreSQL
```

---

## 3. Agent Harness & Control Loop

### Why Vercel AI SDK & Groq?
The agent uses Vercel AI SDK's `generateText` with `@ai-sdk/groq` using the `openai/gpt-oss-120b` model. Rather than using a rigid state machine or regex router, the agent operates in an autonomous control loop:

1. **OBSERVE**: Receive natural language input from Telegram.
2. **REASON**: Select appropriate tools based on Zod parameters and descriptions.
3. **ACT**: Execute deterministic business logic services via tools.
4. **RECEIVE TOOL RESULT**: Inspect tool output (e.g. database stock, draft bill summary, error message).
5. **REASON AGAIN**: Determine if additional tool steps or document generations are needed.
6. **RESPOND**: Send structured, friendly natural language response and deliver any generated files (PDF/PPTX) via Telegram.

---

## 4. Database & Storage Strategy

- **ORM**: Prisma ORM with strongly typed schemas (`Product`, `Customer`, `Bill`, `BillItem`, `KhataTransaction`, `Preference`, `ProcessedUpdate`).
- **Standalone Local Storage**: SQLite (`file:./dev.db`) is configured out of the box so the application runs standalone with zero external database setup required.
- **PostgreSQL Production Ready**: To switch to PostgreSQL for production deployment, simply set `provider = "postgresql"` in `prisma/schema.prisma` and provide `DATABASE_URL`.

---

## 5. Business Rules & Guardrails

### Oversell Protection
All billing finalization runs inside an atomic database transaction (`prisma.$transaction`):
1. Lock and verify draft bill items.
2. Check `product.quantity >= requestedQuantity` for every line item.
3. Reject transaction with a clear error if stock is insufficient.
4. Decrement stock atomically only upon finalization.

### GST Calculation
Intra-state GST rules are enforced deterministically:
- `taxableValuePaise = Math.round(quantity * unitPrice * 100)`
- `gstAmountPaise = Math.round(taxableValuePaise * (gstRate / 100))`
- `cgst = gstAmount / 2`, `sgst = gstAmount / 2`
- Internal calculations use integer paise arithmetic to avoid floating-point rounding errors.

### Idempotency
`ProcessedUpdate` model tracks processed Telegram `update_id`s. Duplicate updates redelivered by Telegram are recognized and skipped cleanly.

---

## 6. How to Run Locally

### Prerequisites
- Node.js 18+ & npm

### Setup Steps
1. **Clone & Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file (refer to `.env.example`):
   ```env
   DATABASE_URL="file:./dev.db"
   GROQ_API_KEY="gsk_..."
   TELEGRAM_BOT_TOKEN="8916796971:AAG_..."
   ```

3. **Database Setup & Seeding**:
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

## 7. Demonstration Flow

| Step | User Prompt Example | Agent Action & Tool Called |
|------|--------------------|---------------------------|
| 1. Stock Check | *"How much Maggi do we have?"* | Calls `get_product` / `search_products`. Returns database stock. |
| 2. Receive Stock | *"Add 20 packets of Maggi."* | Calls `receive_stock`. Replenishes inventory in DB. |
| 3. Multi-item Bill | *"Bill 2 Atta and 3 Maggi for Ravi."* | Calls `add_item_to_bill`. Creates active draft bill. |
| 4. Bill Editing | *"Actually remove one Maggi."* | Calls `remove_item_from_bill`. Updates draft quantities. |
| 5. Oversell Protection | *"Add 500 Maggi."* | Rejects transaction with insufficient stock message. |
| 6. Finalize Bill | *"Finalize with UPI."* | Calls `finalize_bill`. Executes `$transaction` & stock decrement. |
| 7. PDF Tax Invoice | *"Send me the invoice."* | Calls `generate_invoice_pdf`. Uploads PDF document to Telegram. |
| 8. Khata Credit | *"Give Ravi ₹300 worth of groceries on credit."* | Calls `add_credit`. Records credit entry in Khata ledger. |
| 9. Credit Payment | *"Ravi paid ₹100."* | Calls `record_credit_payment`. Updates customer balance. |
| 10. Daily Analytics | *"Give me today's sales report."* | Calls `get_daily_sales`. Returns sales & tax summary. |
| 11. PPTX Deck | *"Create the sales analysis deck."* | Calls `generate_analysis_pptx`. Uploads 6-slide PPTX deck to Telegram. |
| 12. Preference Memory | *"Remember that I prefer UPI."* | Calls `set_preference`. Persists preference in DB. |
| 13. Reset Session | `/new` | Resets draft bill session while keeping saved preferences. |

---

## 8. Deployment

To deploy to Railway, Render, or any Node.js container:
1. Connect repository.
2. Set environment variables (`DATABASE_URL`, `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN`).
3. Build command: `npm run build && npm run db:push`
4. Start command: `npm start`
