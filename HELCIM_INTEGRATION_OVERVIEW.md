# Helcim API Integration – Technical Overview
**Prepared for submission to tier2support@helcim.com**

---

## 1. Company & Platform Summary

**Platform:** LNDRYOS — a multi-tenant SaaS platform purpose-built for commercial laundry businesses (laundromats, laundry-by-the-pound, pickup-and-delivery services).

**Operator model:** Each tenant is an independent laundry business. Staff log into a web-based point-of-sale terminal to serve customers walk-in, process pickup orders, and sell products/services including prepaid store credit gift cards. Customers interact directly with a branded online payment page when paying emailed invoices.

---

## 2. Integration Architecture

### 2.1 System Components

```
Customer Browser                        Staff Browser
(online invoice payment)                (POS terminal)
        │                                      │
        ▼                                      ▼
Next.js 15 Frontend (Vercel Edge) ─────────────┘
        │  HTTPS only — no card data stored client-side
        ▼
tRPC API Layer (Next.js API Routes, server-side only)
        │  Card data never logged, never persisted
        ▼
Helcim Payment API  ←──────────────────────────────┐
        │                                           │
        ▼                                    Hardware API
Supabase PostgreSQL                    (Helcim Smart Terminal /
(transaction records,                   Card Reader GEN3)
 no raw card data stored)
```

### 2.2 Two Payment Paths

#### Path A — Card-Present (Helcim Hardware API)
Staff use a Helcim Smart Terminal (GEN1, GEN2, or Card Reader GEN3) connected to the POS. When a customer taps, inserts, or swipes their card:

1. The POS sends an amount + terminal ID to the **Helcim Payment Hardware API**
2. Helcim communicates directly with the physical device to prompt the customer
3. Card data never leaves the terminal — it never touches our servers
4. The terminal returns a transaction response; we store only the transaction ID and masked card details

This path covers the majority of in-person card transactions and requires **no full card number handling**.

#### Path B — Customer Self-Pay Online (Email Invoice Link + Save Card on File)
Customers receive email invoices with a payment link. They click through to a hosted payment page within LNDRYOS where they enter their own card details directly and optionally save the card for future charges.

This path requires full card number handling. Helcim's tokenization alternatives (HelcimPay.js and HelcimPay checkout) are not viable here for two reasons detailed in Section 3.

---

## 3. Why Full Card Numbers Are Required

### 3.1 HelcimPay.js Redirects Customers to a Helcim-Branded Payment Window

LNDRYOS is a white-label SaaS platform. Each tenant — an independent laundry business — operates under their own brand identity. When a customer receives an email invoice and clicks the payment link, they arrive at a page within LNDRYOS that carries the laundry business's branding.

HelcimPay.js would redirect or iframe the customer into a Helcim-branded checkout experience at that point. The customer would see Helcim's UI, logos, and domain — not the laundry business they have a relationship with. This:

- Breaks the trust and brand continuity the tenant relies on
- Confuses customers unfamiliar with Helcim
- Is incompatible with the white-label nature of the platform

A custom card entry form within our UI, submitting to the Helcim Payment API server-side, is the only way to maintain a fully branded, seamless checkout experience while keeping the customer on our domain throughout.

### 3.2 Customers Saving a Card for Future Staff-Initiated Charges

When a customer pays an emailed invoice online, they are offered the option to save their card for future charges. The intended flow is:

1. Customer enters their card in our branded checkout page
2. We submit the card to the Helcim Payment API
3. Helcim returns a `cardToken`
4. We store the token against their customer profile
5. All future charges (recurring pickups, walk-in visits) use the stored token — the customer never needs to enter their card again, and staff can initiate charges at order completion without any customer action

HelcimPay.js cannot support this flow. It processes the payment inside Helcim's own session and returns a token only in the context of that specific Helcim-initiated transaction. There is no mechanism for a customer to "register" their card through a Helcim-hosted window in a way that produces a persistable, reusable token tied to their LNDRYOS customer profile for staff-initiated future charges. Full card number submission through our own branded form is required to create this token relationship.

### 3.3 Card Tokens Cannot Exist Before the First Transaction

Card tokens in Helcim are created as a byproduct of a completed transaction (purchase, preauth, or verify). For a customer paying for the first time via an emailed invoice, there is no pre-existing token. Full card number submission to the Payment API is the only mechanism available to generate the initial token.

---

## 4. Data Flow — Customer Online Self-Pay

```
1. Customer receives email invoice → clicks "Pay Now" link

2. Customer lands on LNDRYOS-hosted payment page (tenant-branded, no Helcim UI)
   → Sees custom card entry form: card number, expiry, CVV, name on card
   → Optional checkbox: "Save this card for future payments"

3. Customer submits form
   [ Data transmitted via HTTPS POST to our tRPC API handler ]
   [ Our server NEVER writes card data to any database or log ]

4. tRPC handler constructs Helcim API request:

   POST https://api.helcim.com/v2/payment/purchase
   Headers:
     api-token: <HELCIM_API_TOKEN>          // server-side env variable only
     idempotency-key: <uuid-per-request>
   Body:
     {
       "amount": 42.50,
       "currency": "CAD",
       "cardData": {
         "cardNumber": "4111111111111111",  // plaintext — never stored
         "cardExpiry": "1228",              // MMYY format
         "cardCVV":    "123"
       },
       "billingAddress": {
         "name": "Jane Smith"
       },
       "customerCode": "<helcim_customer_code>"
     }

5. Helcim processes and returns:
   {
     "transactionId": 12345678,
     "status": "APPROVED",
     "cardToken": "tok_abc123xyz",          // stored for future use
     "cardF4L4": "411111XXXXXX1111",
     "approvalCode": "T1A2B3",
     ...
   }

6. Our handler stores in Supabase:
   - transactionId, status, approvalCode (no card data)
   - cardToken linked to customer profile (if "save card" was checked)
   - cardF4L4 for display (e.g. "Visa ending 4242")

7. Card number, expiry, and CVV are discarded immediately — never persisted

8. Future staff-initiated charges (pickup orders, walk-in visits) use the stored
   cardToken — customer is never asked to re-enter their card
```

---

## 5. Security Controls

| Control | Implementation |
|---|---|
| Card data in transit | HTTPS/TLS 1.2+ only. Card fields submitted by the customer directly to our API — never touch client-side storage, cookies, or logs |
| Card data at rest | **Never stored.** Our Supabase database contains only transaction IDs, masked card digits (F4L4), and card tokens returned by Helcim |
| API token storage | `HELCIM_API_TOKEN` stored as an environment variable in Vercel. Never exposed to the client bundle |
| Server-side only | The Helcim API call is made exclusively from our Next.js API route (server environment). Card data and the API token are never visible to browser JavaScript |
| Customer authentication | Customers access their payment page via a signed, time-limited token in the email invoice link |
| Staff access | Staff authenticate via Supabase Auth (email + password) with role-based access control |
| Logging | Application logs (Vercel) are configured to redact card-data fields before writing. No card numbers appear in any log pipeline |
| Idempotency keys | Every Helcim request includes a UUID idempotency key to prevent duplicate charges on network retries |

---

## 6. PCI DSS Compliance Path

We understand that processing full card numbers via the Payment API places us in **SAQ-D** scope. Our approach:

- We will engage a qualified security assessor (QSA) or approved scanning vendor (ASV) to complete the SAQ-D questionnaire as a third-party auditor
- The resulting Attestation of Compliance (AOC) will be submitted alongside this technical overview
- The AOC will be renewed annually and re-uploaded to our Helcim Security and Compliance dashboard as required

Our card handling architecture is designed to minimize cardholder data environment (CDE) scope:
- Card data enters our system only from the customer's own browser session
- It travels to Helcim in a single server-side HTTPS call and is immediately discarded
- No card data is written to any database, cache, message queue, or log
- The CDE boundary is limited to our Vercel-hosted API routes

---

## 7. Token Reuse After First Transaction

Once a customer's first online payment succeeds, Helcim returns a `cardToken`. We store that token against the customer record. All subsequent charges — whether initiated by staff at the POS or triggered automatically — use the stored token. **Full card numbers are only required for the customer's initial card entry.** This progressively reduces our SAQ-D exposure over time as more customers have tokens on file.

---

## 8. Volumes and Merchant Details

- **Business type:** B2B SaaS — we are the service provider. Each laundry business operating on our platform is a Helcim sub-merchant.
- **Transaction mix:** Majority of in-person volume via card-present Hardware API (no card data on our servers). Full card number path applies to online invoice payments only.
- **Geography:** Canada (CAD billing)
- **Helcim Merchant ID:** *(to be included at submission)*

---

## 9. Summary of Why Approval Is Needed

| Requirement | Why Token / HelcimPay.js Cannot Substitute |
|---|---|
| Branded online checkout | HelcimPay.js redirects to a Helcim-branded window; incompatible with white-label platform |
| Customer saves card for future charges | HelcimPay.js does not produce a persistable token in our system usable for staff-initiated future charges |
| First-time card capture | No token exists before the customer's first transaction; full card number is the only path to generate one |
| Recurring charges (post-token) | Covered by stored token — no full card data needed after the initial payment |

The Hardware API handles all card-present in-person volume with no card data touching our servers. Full card number processing is limited exclusively to the customer-initiated online invoice payment flow.

---

*Prepared by LNDRYOS development team. Submit to: tier2support@helcim.com along with your AOC and Helcim merchant ID.*
