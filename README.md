# G-Excel — Smart Excel-to-Form Autofill

A Chrome Extension (Manifest V3) that parses local Excel/CSV files, intelligently maps columns to web form fields, and autofills forms with validation. **All processing happens locally** — no data ever leaves your machine.

---

## ✨ Features

- **Smart Auto-Mapping** — Multi-factor weighted scoring matches Excel columns to form fields using name similarity, label matching, attribute analysis, synonym recognition, and type compatibility
- **Excel & CSV Support** — Upload `.xlsx`, `.xls`, or `.csv` files with multi-sheet support via SheetJS
- **Validation Engine** — Validates email, phone, number, date, URL, select options, and required fields before filling
- **Fill Modes** — Single row, batch (all rows with configurable delay), or preview-only (dry run)
- **Domain Profiles** — Save and auto-load mapping profiles per website
- **React Compatible** — Uses native value setters + synthetic event dispatch for framework compatibility
- **Privacy First** — Zero network calls, no telemetry, minimal permissions (`activeTab`, `scripting`, `storage`)

---

## 📁 Project Structure

```
extension/
├── manifest.json            # Chrome Extension manifest (V3)
│
├── popup/                   # Extension popup UI
│   ├── popup.html           # 4-tab interface (Data, Mapping, Settings, Profiles)
│   ├── popup.js             # Main controller — upload, mapping, fill, profiles
│   └── styles.css           # Clean white professional theme
│
├── content/                 # Content scripts (injected into web pages)
│   ├── content.js           # Message listener — routes actions from popup
│   └── detector.js          # Form field detection engine
│
├── core/                    # Core logic modules
│   ├── matcher.js           # Smart matching algorithm (weighted scoring)
│   ├── mapper.js            # Mapping orchestrator (auto + manual + profiles)
│   ├── validator.js         # Per-type validation rules
│   └── filler.js            # Autofill engine (single, batch, preview)
│
├── utils/                   # Utility modules
│   ├── logger.js            # Toggleable debug logger
│   ├── synonyms.js          # Field name synonym dictionary
│   └── storage.js           # Chrome storage wrapper for profiles & settings
│
├── lib/                     # Third-party libraries (bundled locally)
│   └── xlsx.full.min.js     # SheetJS — Excel/CSV parser
│
├── icons/                   # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
└── test/                    # Testing resources
    ├── test-form.html       # Comprehensive test form (all field types)
    └── test-data.csv        # 5-row sample dataset
```

---

## 🚀 Getting Started

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/Ralein/G-Excel.git
   ```
2. Open Chrome → navigate to `chrome://extensions`
3. Enable **Developer Mode** (top-right toggle)
4. Click **"Load unpacked"** → select the `extension/` folder

### Quick Test

1. Open `extension/test/test-form.html` in a browser tab
2. Click the **G-Excel** extension icon
3. **Data tab** → upload `test/test-data.csv`
4. **Mapping tab** → click **Auto-Map** → click **Fill Row**

---

## 🧠 How Smart Matching Works

The matcher scores each column↔field pair using 5 weighted factors:

| Factor | Weight | What It Checks |
|--------|--------|----------------|
| Name similarity | 40% | Column name vs field `name`/`id` (Levenshtein + token overlap) |
| Label similarity | 25% | Column name vs `<label>` text |
| Attribute matching | 20% | `placeholder`, `aria-label`, data attributes |
| Synonym recognition | 10% | "phone" ↔ "mobile" ↔ "tel" ↔ "cell" etc. |
| Type compatibility | 5% | Data type (email, date, number) vs field `type` |

Matches are classified: **High** (≥0.75), **Medium** (0.5–0.74), or **Low** (<0.5).

---

## ⚙️ Settings

| Option | Default | Description |
|--------|---------|-------------|
| Fill Mode | Single Row | Single, Batch, or Preview |
| Delay | 500ms | Pause between rows in batch mode |
| Skip filled fields | Off | Don't overwrite existing values |
| Highlight fields | On | Green/red glow on filled fields |
| Stop on error | On | Halt batch on validation failure |
| Auto-submit | Off | Submit form after filling |

---

## 🔐 Privacy & Security

- **Local-only processing** — Excel data stays in browser memory, never transmitted
- **Minimal permissions** — Only `activeTab`, `scripting`, `storage`
- **No external requests** — All libraries bundled locally
- **Session-only data** — File data discarded when popup closes (unless opted in)

---

## 🛠 Tech Stack

- **Vanilla JavaScript (ES6+)** — No frameworks, no build step
- **Chrome Extension Manifest V3** — Modern extension architecture
- **SheetJS** — Excel/CSV parsing
- **Chrome Storage API** — Profile & settings persistence

---

## 📄 License

MIT
