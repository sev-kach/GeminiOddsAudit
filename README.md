# OddsAudit — credit ratings for prediction markets

Paste any Polymarket market and get a rating from AAA to CCC in about two seconds: was the price
made by real traders, or staged by a few wallets?

**Live app (Google AI Studio):** https://ai.studio/apps/7a97d12f-6221-4bff-8c3a-a53df7049f7c

## The problem

Prediction markets have become a source of truth. Newsrooms quote "Polymarket gives it 63%",
traders size positions on those odds, and lenders accept prediction-market shares as collateral.

But a market's price and volume are only as real as the people trading it. On a thin market, a few
wallets can trade with each other, inflate the volume and push the price wherever they want. Here
is what that costs the people who rely on the price.

### 1. The lender: collateral priced by the attacker

A lending protocol accepts "Yes" shares of a quiet market as collateral, valued at the market price.

1. The attacker buys cheap "Yes" shares at 20¢ over a few days.
2. Using a handful of wallets, they buy from each other at rising prices: 30¢, 45¢, 60¢. The
   order book is thin, so little real money is needed, and the volume looks like real demand.
3. At 60¢, they deposit the shares as collateral and borrow the maximum against them.
4. They stop. The price falls back to 20¢, the collateral is worth a third of the loan, and the
   lender eats the loss.

This is not hypothetical. In October 2022 a trader pumped the thin market behind Mango Markets'
collateral and borrowed against the inflated value, taking over **$110M** from the protocol
([CFTC](https://www.cftc.gov/PressRoom/PressReleases/8647-23)).
The price was "real" on the exchange; it was made by one person.

### 2. The trader: walking into a staged market

A trader sees a market at 70¢ with $40,000 of weekly volume and a busy trade feed, and decides the
crowd knows something. In reality, two or three fresh wallets have been trading back and forth to
paint that picture. The trader buys at 70¢, the staging wallets sell into the order, and the price
drops back to where real demand sits. The trader paid for a consensus that never existed.

### 3. The bot and the newsroom: fooled by fake volume

Trading bots and dashboards rank markets by volume and treat volume as confidence. Newsrooms quote
the busiest markets. Fake volume pushes a staged market up those rankings, so bots copy-trade it and
headlines repeat its odds. Crypto went through this already: in 2019 Bitwise showed the SEC that
about **95% of reported bitcoin exchange volume** was fake
([The Block](https://theblock.co/news/ecosystems/2019-03-22-bitwise-nearly-95-of-reported-bitcoin-trading-volume-are-artificially-created-by-unregulated-exchanges-16958)),
and every volume-driven ranking built on that data was wrong.

### It happens at scale

- Columbia University researchers estimated that about **25% of Polymarket's historical volume**
  looked like wash trading ([Decrypt](https://decrypt.co/347842/columbia-study-25-polymarket-volume-wash-trading)).
- Solidus Labs found **$253M of wash trading, 15% of volume**, in the 2024 US election market.
- Chaos Labs estimated about **a third** of that market's volume was likely washed.

The exchanges know: Kalshi hired Solidus Labs and Polymarket works with Chainalysis. But that
surveillance is internal. The lender, the trader and the newsroom, the people actually relying on
the price, have no way to check a market before they act on it.

## The solution

OddsAudit is an independent rating for every market. It reads a week of trades with both
counterparties, looks up the history of every significant wallet, runs seven checks, and turns them
into one letter rating with the evidence behind it. Gemini then checks the news to tell informed
trading (a real event moved the price) from manipulation (nothing did).

A rating agency is valuable because it is independent. An exchange can't credibly grade its own
markets, just as a bond issuer can't rate its own bonds.

## Who uses it

| User | Question they need answered | What OddsAudit gives them |
|---|---|---|
| **Lenders and DeFi protocols** accepting prediction-market shares as collateral | Can I lend against this market, and how much? | A per-market rating and the evidence, via API. |
| **Funds and data platforms** using prediction-market prices as signals | Which markets produce clean data? | Ratings across markets to filter out staged prices. |
| **Traders** | Is this price real, or am I trading against a few wallets? | Free rating for any market, in seconds. |

## Example

[Will Elissa Slotkin win the 2028 US Presidential Election?](https://polymarket.com/market/will-elissa-slotkin-win-the-2028-us-presidential-election)
shows $43k of weekly volume and looks active. OddsAudit rates it **CCC**: most of the money comes
from brand-new wallets, one wallet that made its first-ever trade two days earlier carries 62% of all
trading, and nearly all trading sits in wash-like patterns. Gemini finds no news that explains it.

[Will the Fed cut rates by 25 bps in December?](https://polymarket.com/market/will-the-fed-decrease-interest-rates-by-25-bps-after-the-december-2026-meeting-20260729232808634),
by contrast, rates **AAA**: established traders, deep book, no wash loops.

Ratings move with live trading, so the links show the current rating.

## Why now

Prediction markets are turning into a regulated financial asset class with billions in monthly
volume. Every asset class grows a ratings and data-integrity layer (credit has S&P and Moody's,
crypto has Chainalysis and Kaiko). Prediction markets don't have one yet.

## The checks (deterministic code, public data only)

| # | Check | What it catches | Data |
|---|---|---|---|
| 1 | Established-trader volume | Volume from wallets with no real history. Counts only money from wallets with a substantial, long trading record, capped per wallet so a few aged accounts can't carry a market | Data API `/trades`, `/user-stats`, `/activity` |
| 2 | Wallet concentration | A price set by a handful of accounts | `/trades` |
| 3 | Wash-trade loops | Self-trades, closed wallet pairs, round-trippers with few counterparties | `/trades` (both counterparties per transaction) |
| 4 | Fresh-wallet cluster | Sockpuppets created together | `/activity` first trade per wallet |
| 5 | Order-book depth | Prices that one order can move | CLOB `/book` |
| 6 | Price move vs real volume | Big swings carried by new or unknown wallets | CLOB `/prices-history` + check 1 |
| 7 | Proven traders present | Informed pricing (bonus only) | `/user-stats` lifetime PnL |

The checks are weighted into a 0–100 score and a letter rating from AAA to CCC. The exact thresholds
are kept in server configuration, not in this repository: a published threshold is one a manipulator
can stage volume to clear.

## Gemini's role

Gemini 2.5 Flash with Google Search grounding reads the check results, searches the past week's
news, and decides whether real news explains the trading (informed traders) or nothing does
(manipulation). It writes the verdict and cites sources. It never changes a number.


## Built with Gemini in Google AI Studio

The application code in this repository was generated by Gemini in Google AI Studio Build from a
single detailed specification, then synced here from AI Studio. The full Gemini chat history is
included in the AI Studio share link.

## Run

The app needs two server secrets:

- `GEMINI_API_KEY`: a Gemini API key (set automatically in AI Studio)
- `AUDIT_PARAMS`: the rating thresholds as JSON (kept private, not in this repository)

```
npm install
npm run dev     # app and API on http://localhost:3000
```
