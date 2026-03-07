# MTG Scanner - Payment System Design

## Executive Summary

**Recommendation:** Freemium model with a generous free tier (5 scans/day) and a monthly subscription ($2.99/month) for unlimited scans, implemented via **RevenueCat** with native Apple IAP and Google Play Billing. Backend verification through RevenueCat webhooks to FastAPI.

---

## 1. Payment Model: Free Tier + Subscription

### Why This Model

| Model | Pros | Cons |
|-------|------|------|
| **Free tier + subscription** | Low friction, predictable revenue, matches competitor pricing | Needs usage tracking |
| Pay-per-scan credits | Fair per-use pricing | High friction, confusing UX, complex to implement |
| One-time purchase | Simple | No recurring revenue, unsustainable with per-scan API costs |
| Pure subscription | Predictable revenue | Too aggressive for a scanner utility - users won't subscribe without trying |

**The recommendation: Free tier + subscription.** Here's why:

- **Target user behavior**: MTG players browsing card shops need quick, frictionless scanning. A free tier lets them try the app immediately without commitment.
- **Competitor alignment**: ManaBox offers free with limits, CardCastle and CS Scanner charge ~$30/year for premium. $2.99/month ($35.88/year) is competitive.
- **Cost sustainability**: At $0.002/scan, 5 free scans/day costs $0.01/user/day max. Even with 1000 free users, that's only ~$300/month - manageable.
- **Conversion path**: Users who hit the 5-scan limit while actively browsing a card shop are in the perfect mindset to subscribe.

### Pricing Structure

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | 5 scans per day, basic card identification + pricing |
| **Pro Monthly** | $2.99/month | Unlimited scans, scan history, bulk scanning |
| **Pro Annual** | $19.99/year (~$1.67/month) | Same as monthly, 44% discount |

The annual plan at a significant discount encourages longer commitment and reduces churn.

---

## 2. Payment Platform: RevenueCat (Not Stripe)

### Can We Use Stripe for Digital Goods in a Mobile App?

**Short answer: No, not practically.** Here's the current state:

- **US iOS (post-Epic v. Apple, April 2025):** Apps *can* link to external web checkout (Stripe), but Apple requires a special entitlement, and you must still display Apple's mandated warning sheet. Apple charges a reduced commission (up to 27%) on external purchases anyway.
- **US Android (post-October 2025):** Google now allows third-party payment processors in-app, but plans to charge 9-20% fees on alternative billing.
- **Outside the US:** Traditional app store billing requirements still apply. Stripe cannot be used for digital goods.
- **The injunction is temporary:** The US changes are effective until November 1, 2027, and may change.

**Bottom line:** For a small app targeting a global audience, fighting app store billing is not worth the complexity. Use native IAP through RevenueCat.

### Why RevenueCat Over Direct IAP

| Approach | Effort | Maintenance | Features |
|----------|--------|-------------|----------|
| Direct Apple IAP + Google Play Billing | High - two separate APIs, receipt validation, edge cases | Ongoing - API changes, receipt format changes | Basic |
| **RevenueCat** | Low - single SDK, handles both platforms | Minimal - RevenueCat maintains the integration | Analytics, webhooks, paywalls, A/B testing, customer management |

RevenueCat is the clear winner because:

1. **Single SDK** for iOS + Android + Web (if needed later)
2. **Built-in Expo support** with config plugin - no ejecting required
3. **Server-side receipt validation** handled by RevenueCat
4. **Webhooks** for backend subscription status sync
5. **Free up to $2,500 MTR** - we won't pay RevenueCat anything until we're making real money

### RevenueCat Pricing

| Plan | Cost | MTR Limit |
|------|------|-----------|
| **Free** | $0 | Up to $2,500 MTR |
| Starter | $0 base + 0.8% of MTR above threshold | Up to $10,000 MTR |
| Pro | 1% of MTR | Unlimited |

At $2.99/month per subscriber:
- 100 paying users = $299 MTR = **Free**
- 835 paying users = $2,500 MTR = Free tier limit reached
- 1,000 paying users = $2,990 MTR = ~$4/month to RevenueCat (Starter)

RevenueCat costs are negligible compared to app store commissions (15-30%).

---

## 3. RevenueCat + Expo SDK 52 Integration

### Package Setup

RevenueCat provides first-class Expo support via `react-native-purchases` with an Expo config plugin.

```bash
npx expo install react-native-purchases react-native-purchases-ui
```

### app.json / app.config.js Configuration

```json
{
  "expo": {
    "plugins": [
      "react-native-purchases"
    ]
  }
}
```

### SDK Initialization (in App.tsx or similar)

```typescript
import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

const REVENUECAT_API_KEY_APPLE = 'appl_xxxxx';
const REVENUECAT_API_KEY_GOOGLE = 'goog_xxxxx';

async function initializePurchases() {
  Purchases.configure({
    apiKey: Platform.OS === 'ios'
      ? REVENUECAT_API_KEY_APPLE
      : REVENUECAT_API_KEY_GOOGLE,
  });
}
```

### Key Limitations

- **Expo Go does not support real purchases.** RevenueCat auto-detects Expo Go and uses mock APIs (Preview API Mode). This is fine for UI development.
- **Development builds required for real testing.** Must use `eas build --profile development` to test actual purchases.
- **Sandbox testing** via Apple Sandbox accounts and Google test accounts.

### Paywall UI

RevenueCat provides `react-native-purchases-ui` with pre-built paywall components that can be configured in the RevenueCat dashboard without app updates. This is ideal for A/B testing pricing.

```typescript
import RevenueCatUI from 'react-native-purchases-ui';

// Present paywall when user hits scan limit
await RevenueCatUI.presentPaywall();
```

---

## 4. Backend Verification: FastAPI + RevenueCat Webhooks

### Architecture Overview

```
Mobile App (Expo)
    |
    |-- RevenueCat SDK (handles purchases)
    |-- Sends app_user_id to FastAPI with each scan request
    |
FastAPI Backend
    |
    |-- Receives RevenueCat webhooks (subscription events)
    |-- Stores subscription status in SQLite
    |-- Enforces scan limits per user
    |
RevenueCat
    |-- Validates receipts with Apple/Google
    |-- Sends webhooks to FastAPI on subscription changes
```

### Webhook Endpoint

```python
from fastapi import FastAPI, Request, HTTPException
import httpx

app = FastAPI()

REVENUECAT_WEBHOOK_AUTH = "your-webhook-auth-key"
REVENUECAT_API_KEY = "sk_xxxxx"  # RevenueCat secret API key

@app.post("/webhooks/revenuecat")
async def revenuecat_webhook(request: Request):
    # Verify authorization header
    auth = request.headers.get("Authorization")
    if auth != f"Bearer {REVENUECAT_WEBHOOK_AUTH}":
        raise HTTPException(status_code=401)

    body = await request.json()
    event_type = body.get("event", {}).get("type")
    app_user_id = body.get("event", {}).get("app_user_id")

    if event_type in [
        "INITIAL_PURCHASE",
        "RENEWAL",
        "PRODUCT_CHANGE",
        "UNCANCELLATION",
    ]:
        await update_subscription_status(app_user_id, active=True)
    elif event_type in [
        "CANCELLATION",
        "BILLING_ISSUE",
        "SUBSCRIPTION_PAUSED",
        "EXPIRATION",
    ]:
        # Double-check with RevenueCat API for accuracy
        status = await check_revenuecat_subscriber(app_user_id)
        await update_subscription_status(app_user_id, active=status)

    return {"status": "ok"}


async def check_revenuecat_subscriber(app_user_id: str) -> bool:
    """Verify subscription status via RevenueCat REST API."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.revenuecat.com/v1/subscribers/{app_user_id}",
            headers={"Authorization": f"Bearer {REVENUECAT_API_KEY}"},
        )
        data = resp.json()
        entitlements = data.get("subscriber", {}).get("entitlements", {})
        pro = entitlements.get("pro", {})
        # Check if entitlement is active
        expires = pro.get("expires_date")
        if expires is None:
            return False
        from datetime import datetime, timezone
        return datetime.fromisoformat(expires.replace("Z", "+00:00")) > datetime.now(timezone.utc)
```

### Scan Limit Enforcement (Server-Side)

```python
from datetime import date

@app.post("/api/scan")
async def scan_card(request: Request, user_id: str):
    user = await get_user(user_id)

    if not user.is_pro:
        today_scans = await get_scan_count(user_id, date.today())
        if today_scans >= 5:
            return {"error": "daily_limit_reached", "limit": 5}

    # Process the scan via OpenRouter
    result = await process_scan(request)

    await increment_scan_count(user_id, date.today())
    return result
```

### Database Schema (SQLite)

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,         -- RevenueCat app_user_id
    is_pro BOOLEAN DEFAULT FALSE,
    subscription_expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scan_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    scan_date DATE NOT NULL,
    scan_count INTEGER DEFAULT 0,
    UNIQUE(user_id, scan_date),
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### User Identity

Since there are no user accounts currently, use **anonymous RevenueCat app_user_ids**:

1. On first app launch, RevenueCat generates an anonymous ID (`$RCAnonymousID:xxxxx`)
2. Store this ID on the device (AsyncStorage / SecureStore)
3. Send this ID with every scan request to the backend
4. The backend uses this ID to track subscription status and scan usage

This avoids building a full auth system. If accounts are added later, RevenueCat supports aliasing anonymous IDs to logged-in user IDs.

---

## 5. Step-by-Step Implementation Plan

### Phase 1: Backend Preparation (1-2 days)

1. Add SQLite database to FastAPI backend (users + scan_usage tables)
2. Add user identification middleware (accept `X-User-ID` header)
3. Add scan counting and rate limiting (5/day for free users)
4. Add `/webhooks/revenuecat` endpoint
5. Add `/api/subscription-status` endpoint for the app to check status

### Phase 2: RevenueCat Setup (1 day)

1. Create RevenueCat account (free)
2. Create project in RevenueCat dashboard
3. Configure Apple App Store Connect integration (shared secret)
4. Configure Google Play Console integration (service account JSON)
5. Create products in App Store Connect and Google Play Console:
   - `pro_monthly` - $2.99/month auto-renewable subscription
   - `pro_annual` - $19.99/year auto-renewable subscription
6. Create corresponding products and offerings in RevenueCat dashboard
7. Create "pro" entitlement in RevenueCat
8. Configure webhook URL pointing to FastAPI backend
9. Set webhook authorization header

### Phase 3: App Integration (2-3 days)

1. Install `react-native-purchases` and `react-native-purchases-ui`
2. Add Expo config plugin to app.json
3. Initialize RevenueCat SDK on app launch
4. Store and send anonymous user ID with scan requests
5. Build paywall screen (or use RevenueCat's pre-built paywalls)
6. Add scan limit logic:
   - Track remaining daily scans
   - Show paywall when limit reached
   - Show scan count indicator in UI
7. Add subscription status check on app launch
8. Add "Manage Subscription" / "Restore Purchases" button in settings

### Phase 4: Testing (1-2 days)

1. Create EAS development builds for iOS and Android
2. Test with Apple Sandbox accounts
3. Test with Google Play test accounts
4. Test webhook delivery and backend status updates
5. Test edge cases: expiration, renewal, cancellation, billing issues
6. Test restore purchases flow

### Phase 5: Launch

1. Submit app for App Store / Play Store review
2. Monitor RevenueCat dashboard for conversion metrics
3. A/B test pricing if needed via RevenueCat experiments

**Total estimated effort: 5-8 days**

---

## 6. Packages and Services Required

| Component | Package/Service | Cost |
|-----------|----------------|------|
| Payment abstraction | RevenueCat (free tier) | $0 until $2,500 MTR |
| App SDK | `react-native-purchases` + `react-native-purchases-ui` | Free (open source) |
| Apple Developer Account | Apple Developer Program | $99/year |
| Google Developer Account | Google Play Console | $25 one-time |
| Backend database | SQLite (already available) | $0 |
| Backend HTTP client | `httpx` (Python) | Free |

---

## 7. Cost Estimates by Scale

### Assumptions
- 10% of users subscribe (industry average for utility apps is 2-5%, being optimistic)
- Average subscriber uses 20 scans/day
- Free users average 3 scans/day
- API cost per scan: $0.002 (OpenRouter / Gemini 3 Flash Preview)

### 100 Total Users (10 paying)

| Cost Item | Monthly Cost |
|-----------|-------------|
| OpenRouter API (free users: 90 * 3 * 30) | $16.20 |
| OpenRouter API (pro users: 10 * 20 * 30) | $12.00 |
| RevenueCat | $0 (under $2,500 MTR) |
| App Store commission (15% small business) | $4.49 |
| Server (existing Unraid) | $0 |
| **Total costs** | **$32.69** |
| **Revenue** (10 * $2.99) | **$29.90** |
| **Net** | **-$2.79** |

At 100 users you're roughly break-even. The free tier API cost is the main expense.

### 1,000 Total Users (100 paying)

| Cost Item | Monthly Cost |
|-----------|-------------|
| OpenRouter API (free: 900 * 3 * 30) | $162.00 |
| OpenRouter API (pro: 100 * 20 * 30) | $120.00 |
| RevenueCat | $0 (under $2,500 MTR) |
| App Store commission (15%) | $44.85 |
| Server (existing Unraid) | $0 |
| **Total costs** | **$326.85** |
| **Revenue** (100 * $2.99) | **$299.00** |
| **Net** | **-$27.85** |

Still slightly negative due to free-tier API costs. Options to improve:
- Reduce free scans to 3/day
- Add a small interstitial ad for free users
- Increase subscription price to $3.99

### 10,000 Total Users (1,000 paying)

| Cost Item | Monthly Cost |
|-----------|-------------|
| OpenRouter API (free: 9,000 * 3 * 30) | $1,620.00 |
| OpenRouter API (pro: 1,000 * 20 * 30) | $1,200.00 |
| RevenueCat (Starter, ~1% of MTR) | ~$30.00 |
| App Store commission (15%) | $448.50 |
| Server (may need upgrade) | ~$20.00 |
| **Total costs** | **$3,318.50** |
| **Revenue** (1,000 * $2.99) | **$2,990.00** |
| **Net** | **-$328.50** |

At scale, the free tier API cost dominates. Mitigations:
- **Reduce free tier to 3 scans/day** saves $540/month
- **Add annual plan**: If 30% choose annual ($19.99/year = $1.67/month), effective ARPU drops but churn improves
- **Cache common card results** to avoid redundant API calls (huge savings potential)
- **Consider on-device model** for basic card identification, use API only for pricing

### Key Insight

The biggest cost driver is not the payment system - it's the free tier API usage. The payment infrastructure (RevenueCat) is essentially free at these scales. **Optimizing the free tier (fewer scans, caching, on-device fallback) is more important than optimizing payment costs.**

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| App store rejection | Use native IAP via RevenueCat - fully compliant |
| Webhook delivery failure | RevenueCat retries 5 times; also check status via REST API on app launch |
| Free tier abuse (new devices) | Device fingerprinting or require email for free tier |
| OpenRouter cost spikes | Server-side rate limiting, daily cost caps |
| RevenueCat outage | Cache subscription status locally; grace period of 24h |

---

## 9. Future Enhancements (Not in Initial Scope)

- **User accounts** (email/social login) for cross-device subscription sync
- **Web billing** via RevenueCat Web SDK for lower commission rates
- **Family sharing** support
- **Lifetime purchase** option ($29.99 one-time)
- **Card result caching** to reduce API costs dramatically
- **On-device ML model** for basic card recognition (API only for pricing data)
