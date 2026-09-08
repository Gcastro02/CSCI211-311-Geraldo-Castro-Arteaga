# Central Cash & Carry — Website Project Handoff

_Last updated: August 16, 2026_

This note captures the current state of the project so it can be picked up on
another computer (or in a new Claude chat) without losing context.

---

## What's in this folder

| File | What it is |
|------|-----------|
| **index.html** | The live website (the "welcome" landing version). This is the main deliverable. |
| **images/** | All photos the site uses. **Keep this folder next to index.html** — the site references images by relative path (`images/...`), so if it's missing, photos break. |
| **catalog.html** | Product catalog page (search + category filter + stock badges). Reads from `products.js`. Not yet linked from the current index. |
| **products.js** | The editable product data for the catalog. Sample products for now — replace with real items. |
| **Central_Cash_Carry_Product_Catalog_Template.xlsx** | Fill-in spreadsheet for the real product list. Send it back filled in and it becomes `products.js`. |
| **invoice-central-cash-carry.html** | Itemized invoice, $1,500 total. Fill in your name/contact/invoice #. |
| **web-services-pricing-sheet.html** | Your services & pricing menu to hand to future prospects. |
| **HANDOFF.md** | This file. |
| _prototype 2.html_ | Older draft that became the current index.html — safe to delete. |

---

## Current state of the site (index.html)

- Full-screen **welcome hero** over the storefront photo (`storefront2.jpg`), with a lightened overlay and a smaller headline so the building sign shows through.
- Eyebrow: **"Open to the public · San Jose"** (ES: "Tienda abierta al público · San Jose").
- Tagline: **"One-stop wholesale & retail shop — …"** (ES: "La tienda de mayoreo y menudeo — …").
- Short **welcome note** stating the store is open to the public — bulk and by piece.
- **6 category cards** with photos, icons, descriptions, and item tags: Foodservice & restaurant, Packaging & paper goods, Dry goods & groceries, Beverages, Cleaning & janitorial, Party & seasonal.
- **33-photo gallery** — paged (8 per page) with prev/next and a click-to-enlarge lightbox.
- **Visit section** — storefront photo + "Look for the blue building on Monterey Rd," address, Google Map, Get directions + phone buttons, and a separate **Hours of operation** card (all 7 days + accepted payments).
- **Bilingual toggle** (top-right) — one click switches the whole page EN ⇄ ES. All translations live in a single `T = { … }` object near the bottom of `index.html`; English on the left, Spanish on the right.

## Business facts used on the site

- **Address:** 1919 Monterey Rd, Ste 10, San Jose, CA 95112
- **Phone:** (408) 975-2485
- **Hours:** Mon–Fri 7 AM–7 PM · Sat 8 AM–6 PM · Sun 9 AM–5 PM (open 7 days)

---

## Open to-dos / things to confirm

1. **Product catalog** — fill in the Excel template with real products (name, category, price, in-stock, photo filename), then regenerate `products.js` and link `catalog.html` from the site.
2. **Social links** — the Instagram/Facebook icons currently point to `#`; swap in the real URLs.
3. **Accepted payments** — the Hours card lists Cash · Visa · Mastercard · Debit as a placeholder; confirm and adjust.
4. **Hero image sharpness** — `storefront2.jpg` is web-sized; fine for most screens.
5. **Hosting** — plan is name.com (domain) + GitHub Pages (hosting). Keep the `images/` folder alongside `index.html` when uploading.

---

## How to continue on another computer

- **Easiest:** this folder is in OneDrive. Sign into the same Microsoft account on the laptop and it syncs automatically.
- **USB:** copy the **entire "claude projects" folder**, including the `images/` subfolder. (A ready-made `central-cash-carry-project.zip` is in this folder — copy that one file, then unzip on the laptop.)
- **The chat:** your Claude conversation is tied to your Claude account — sign into the same account on the laptop to find this chat in your history. This HANDOFF.md is the portable summary if you start a fresh chat.
