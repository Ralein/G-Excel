/**
 * Form field detection engine.
 * Scans the DOM for fillable form fields and extracts metadata.
 */
const Detector = (() => {
    /* ───── supported selectors ───── */
    const FIELD_SELECTORS = [
        'input[type="text"]',
        'input[type="email"]',
        'input[type="tel"]',
        'input[type="number"]',
        'input[type="url"]',
        'input[type="date"]',
        'input[type="datetime-local"]',
        'input[type="search"]',
        'input[type="password"]',
        'input[type="checkbox"]',
        'input[type="radio"]',
        'input:not([type])',
        'textarea',
        'select'
    ];

    /* ───── unique selector generator ───── */

    function generateUniqueSelector(element) {
        // Try id
        if (element.id) return `#${CSS.escape(element.id)}`;

        // Try name
        if (element.name) {
            const tag = element.tagName.toLowerCase();
            const nameSelector = `${tag}[name="${CSS.escape(element.name)}"]`;
            if (document.querySelectorAll(nameSelector).length === 1) return nameSelector;
        }

        // Build a path from the element to a unique ancestor
        const parts = [];
        let el = element;
        while (el && el !== document.body) {
            let selector = el.tagName.toLowerCase();
            if (el.id) {
                selector = `#${CSS.escape(el.id)}`;
                parts.unshift(selector);
                break;
            }
            // Add nth-child for uniqueness
            const parent = el.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
                if (siblings.length > 1) {
                    const idx = siblings.indexOf(el) + 1;
                    selector += `:nth-of-type(${idx})`;
                }
            }
            parts.unshift(selector);
            el = el.parentElement;
        }
        return parts.join(' > ');
    }

    /* ───── label extraction ───── */

    function extractLabel(element) {
        // 1. label[for]
        if (element.id) {
            const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
            if (label) return cleanLabel(label.textContent);
        }

        // 2. Wrapping <label>
        const closestLabel = element.closest('label');
        if (closestLabel) {
            // Remove the element's own text
            const clone = closestLabel.cloneNode(true);
            const inputs = clone.querySelectorAll('input, select, textarea');
            inputs.forEach(i => i.remove());
            const text = clone.textContent.trim();
            if (text) return cleanLabel(text);
        }

        // 3. aria-label
        if (element.getAttribute('aria-label')) {
            return element.getAttribute('aria-label').trim();
        }

        // 4. aria-labelledby
        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy) {
            const labelEl = document.getElementById(labelledBy);
            if (labelEl) return cleanLabel(labelEl.textContent);
        }

        // 5. Placeholder
        if (element.placeholder) return element.placeholder.trim();

        // 6. Title
        if (element.title) return element.title.trim();

        // 7. Previous sibling
        let prev = element.previousElementSibling;
        if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV')) {
            const text = prev.textContent.trim();
            if (text && text.length < 60) return cleanLabel(text);
        }

        // 8. Parent text (limited)
        const parent = element.parentElement;
        if (parent) {
            // Direct text nodes only
            const textNodes = Array.from(parent.childNodes)
                .filter(n => n.nodeType === Node.TEXT_NODE)
                .map(n => n.textContent.trim())
                .filter(t => t.length > 0 && t.length < 60);
            if (textNodes.length > 0) return textNodes[0];
        }

        // 9. Table header (if in a table)
        const td = element.closest('td');
        if (td) {
            const cellIndex = td.cellIndex;
            const table = td.closest('table');
            if (table) {
                const headerRow = table.querySelector('thead tr, tr:first-child');
                if (headerRow) {
                    const th = headerRow.cells?.[cellIndex];
                    if (th) return cleanLabel(th.textContent);
                }
            }
        }

        return '';
    }

    function cleanLabel(text) {
        return (text || '')
            .replace(/[:*\n\r\t]+/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /* ───── select options extraction ───── */

    function extractOptions(selectElement) {
        return Array.from(selectElement.options).map(opt => ({
            value: opt.value,
            text: opt.textContent.trim(),
            selected: opt.selected
        }));
    }

    /* ───── visibility check ───── */

    function isVisible(element) {
        if (!element.offsetParent && element.style.position !== 'fixed') return false;
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    /* ───── data attribute extraction ───── */

    function extractDataAttrs(element) {
        const data = {};
        for (const attr of element.attributes) {
            if (attr.name.startsWith('data-')) {
                data[attr.name] = attr.value;
            }
        }
        return Object.keys(data).length > 0 ? data : null;
    }

    /* ───── main detection ───── */

    /**
     * Detect all fillable form fields on the page.
     * @returns {Object[]} Array of field descriptors
     */
    function detectFormFields() {
        const fields = [];
        const seen = new Set();
        const allSelector = FIELD_SELECTORS.join(',');

        document.querySelectorAll(allSelector).forEach(element => {
            // Skip hidden inputs (type="hidden")
            if (element.type === 'hidden') return;

            // Skip invisible fields
            if (!isVisible(element)) return;

            // Skip duplicates
            const selector = generateUniqueSelector(element);
            if (seen.has(selector)) return;
            seen.add(selector);

            const field = {
                selector,
                type: element.type || element.tagName.toLowerCase(),
                name: element.name || '',
                id: element.id || '',
                label: extractLabel(element),
                placeholder: element.placeholder || '',
                ariaLabel: element.getAttribute('aria-label') || '',
                title: element.title || '',
                value: element.value || '',
                required: element.required || false,
                options: element.tagName === 'SELECT' ? extractOptions(element) : null,
                min: element.min || null,
                max: element.max || null,
                dataAttrs: extractDataAttrs(element),
                tagName: element.tagName.toLowerCase()
            };

            fields.push(field);
        });

        return fields;
    }

    return { detectFormFields, generateUniqueSelector, extractLabel, isVisible };
})();
