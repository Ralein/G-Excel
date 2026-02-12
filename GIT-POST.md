# 🚀 Git Post / Release Announcement

---

## 📌 Title
**G-Excel — Smart Excel-to-Form Autofill Chrome Extension**

---

## 📝 Post (for GitHub / LinkedIn / Dev.to)

---

### I built a Chrome Extension that auto-fills web forms from Excel files — with zero cloud dependency 🔒

Tired of manually copying data from spreadsheets into web forms? **G-Excel** does it automatically.

**How it works:**
1. Upload any `.xlsx`, `.xls`, or `.csv` file
2. The extension scans the page for form fields
3. A smart matching algorithm maps your columns → form fields
4. One click fills the entire form — validated and framework-compatible

**What makes it different:**

🧠 **Smart Matching** — Uses 5-factor weighted scoring (name similarity, label matching, attribute analysis, synonym recognition, type compatibility) to auto-map columns to fields. No manual config needed for most forms.

✅ **Validation Before Fill** — Checks email formats, phone patterns, number ranges, date parsing (including Excel serial dates), and dropdown option matching before touching any field.

⚡ **Batch Mode** — Fill hundreds of rows sequentially with configurable delays. Progress tracking and stop controls built in.

💾 **Domain Profiles** — Save your mapping for any website. Next time you visit, it auto-loads your saved config.

🔐 **Privacy First** — Everything runs locally. No APIs, no cloud, no telemetry. Your data never leaves your machine.

⚛️ **Framework Compatible** — Uses native value setters + synthetic event dispatch, so it works with React, Vue, Angular, and vanilla HTML forms.

**Tech:** Vanilla JS, Chrome Manifest V3, SheetJS — no build step, no dependencies beyond what's bundled.

**Try it:** [github.com/Ralein/G-Excel](https://github.com/Ralein/G-Excel)

---

`#chrome-extension` `#javascript` `#productivity` `#open-source` `#webdev`

---

## 🐙 GitHub Release Description

**v1.0.0 — Initial Release**

Smart Excel-to-web-form autofill Chrome extension.

### Features
- 📊 Excel & CSV parsing (SheetJS)
- 🧠 5-factor smart column↔field matching
- ✅ Per-type validation (email, phone, date, number, URL, select)
- ⚡ Single row, batch, and preview fill modes
- 💾 Domain-specific mapping profiles
- 🔐 Privacy-first — all local, zero network calls
- ⚛️ React/Vue/Angular compatible event dispatch

### Installation
1. Download and extract
2. `chrome://extensions` → Developer Mode → Load unpacked → select `extension/`
3. Open any web form → click extension → upload Excel → Auto-Map → Fill

### Files
- 20 source files across 7 directories
- No build step required — load directly as unpacked extension
