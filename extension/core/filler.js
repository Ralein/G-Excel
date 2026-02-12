/**
 * Autofill execution engine.
 * Validates then fills fields, dispatches DOM events, supports
 * single-row, batch (with delay), and preview modes.
 */
const Filler = (() => {
    const HIGHLIGHT_CLASS = 'gexcel-filled-highlight';
    let abortController = null;

    /* ───── event dispatch ───── */

    function dispatchEvents(element) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        // For React / modern frameworks
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
            // Already set the value before calling this, so just trigger react's synthetic event
        }
    }

    /* ───── highlight ───── */

    function highlightElement(element, success) {
        element.classList.add(HIGHLIGHT_CLASS);
        element.style.transition = 'box-shadow 0.3s ease, outline 0.3s ease';
        if (success) {
            element.style.boxShadow = '0 0 0 3px rgba(40, 167, 69, 0.5)';
            element.style.outline = '2px solid #28a745';
        } else {
            element.style.boxShadow = '0 0 0 3px rgba(220, 53, 69, 0.5)';
            element.style.outline = '2px solid #dc3545';
        }

        setTimeout(() => {
            element.style.boxShadow = '';
            element.style.outline = '';
            element.classList.remove(HIGHLIGHT_CLASS);
        }, 3000);
    }

    function removeAllHighlights() {
        document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(el => {
            el.style.boxShadow = '';
            el.style.outline = '';
            el.classList.remove(HIGHLIGHT_CLASS);
        });
    }

    /* ───── fill a single field ───── */

    /**
     * Fill one field with a value.
     * @param {string} selector - CSS selector of the field
     * @param {*} value - The value to fill
     * @param {Object} fieldMeta - Field metadata (type, required, options, min, max)
     * @param {Object} settings - Fill settings
     * @returns {{ success: boolean, error?: string }}
     */
    function fillField(selector, value, fieldMeta, settings) {
        const element = document.querySelector(selector);
        if (!element) {
            return { success: false, error: `Element not found: ${selector}` };
        }

        // Skip if already filled and option is on
        if (settings.skipFilled && element.value && element.value.trim() !== '') {
            return { success: true, skipped: true };
        }

        // Validate
        const validation = Validator.validate(value, fieldMeta);
        if (!validation.valid) {
            if (settings.highlightFields) highlightElement(element, false);
            return { success: false, error: validation.error };
        }

        const finalValue = validation.value !== undefined ? validation.value : value;

        try {
            const type = (fieldMeta.type || 'text').toLowerCase();

            if (type === 'select' || type === 'select-one' || type === 'select-multiple') {
                element.value = finalValue;
                dispatchEvents(element);
            } else if (type === 'checkbox') {
                const shouldCheck = ['true', 'yes', '1', 'on', 'x', '✓'].includes(
                    String(finalValue).toLowerCase().trim()
                );
                if (element.checked !== shouldCheck) {
                    element.checked = shouldCheck;
                    dispatchEvents(element);
                }
            } else if (type === 'radio') {
                // Find the radio with matching value in the group
                const radios = document.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
                const strVal = String(finalValue).toLowerCase().trim();
                for (const radio of radios) {
                    if (radio.value.toLowerCase() === strVal ||
                        (radio.labels?.[0]?.textContent || '').toLowerCase().trim() === strVal) {
                        radio.checked = true;
                        dispatchEvents(radio);
                        break;
                    }
                }
            } else {
                // Use native setter for React compatibility
                // Must pick the correct prototype based on element type
                let nativeSetter;
                const tag = element.tagName;
                if (tag === 'TEXTAREA') {
                    nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLTextAreaElement.prototype, 'value'
                    )?.set;
                } else if (tag === 'SELECT') {
                    nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLSelectElement.prototype, 'value'
                    )?.set;
                } else {
                    nativeSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    )?.set;
                }

                if (nativeSetter) {
                    nativeSetter.call(element, String(finalValue));
                } else {
                    element.value = String(finalValue);
                }
                dispatchEvents(element);
            }

            if (settings.highlightFields) highlightElement(element, true);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /* ───── fill a single row ───── */

    /**
     * Fill all mapped fields for one data row.
     * @param {Object} mapping - { columnName: { selector, field } }
     * @param {Object} rowData - { columnName: value }
     * @param {Object} settings
     * @returns {{ success: boolean, filled: number, skipped: number, errors: Array }}
     */
    function fillRow(mapping, rowData, settings) {
        let filled = 0, skipped = 0;
        const errors = [];

        for (const [column, mapInfo] of Object.entries(mapping)) {
            if (!mapInfo || !mapInfo.selector) continue;
            const value = rowData[column];

            const fieldMeta = {
                type: mapInfo.field?.type || 'text',
                required: mapInfo.field?.required || false,
                options: mapInfo.field?.options || null,
                min: mapInfo.field?.min,
                max: mapInfo.field?.max
            };

            const result = fillField(mapInfo.selector, value, fieldMeta, settings);

            if (result.skipped) {
                skipped++;
            } else if (result.success) {
                filled++;
            } else {
                errors.push({ column, selector: mapInfo.selector, error: result.error });
                if (settings.stopOnError) {
                    return { success: false, filled, skipped, errors };
                }
            }
        }

        return { success: errors.length === 0, filled, skipped, errors };
    }

    /* ───── batch fill ───── */

    /**
     * Fill multiple rows with delay.
     * @returns {Promise<{ totalFilled: number, totalErrors: number, results: Array }>}
     */
    async function fillBatch(mapping, rows, settings, onProgress) {
        abortController = { aborted: false };
        const results = [];
        let totalFilled = 0, totalErrors = 0;

        for (let i = 0; i < rows.length; i++) {
            if (abortController.aborted) {
                results.push({ row: i, aborted: true });
                break;
            }

            const result = fillRow(mapping, rows[i], settings);
            results.push({ row: i, ...result });
            totalFilled += result.filled;
            totalErrors += result.errors.length;

            if (onProgress) {
                onProgress({ current: i + 1, total: rows.length, result });
            }

            if (!result.success && settings.stopOnError) break;

            // Delay between rows
            if (i < rows.length - 1 && settings.delay > 0) {
                await new Promise(r => setTimeout(r, settings.delay));
            }
        }

        abortController = null;
        return { totalFilled, totalErrors, results };
    }

    /* ───── preview (dry run) ───── */

    /**
     * Generate a preview of what would be filled.
     * @returns {{ preview: Array, warnings: Array }}
     */
    function preview(mapping, rowData) {
        const preview = [];
        const warnings = [];

        for (const [column, mapInfo] of Object.entries(mapping)) {
            if (!mapInfo || !mapInfo.selector) continue;
            const value = rowData[column];
            const element = document.querySelector(mapInfo.selector);

            const fieldMeta = {
                type: mapInfo.field?.type || 'text',
                required: mapInfo.field?.required || false,
                options: mapInfo.field?.options || null,
                min: mapInfo.field?.min,
                max: mapInfo.field?.max
            };

            const validation = Validator.validate(value, fieldMeta);

            preview.push({
                column,
                selector: mapInfo.selector,
                fieldLabel: mapInfo.field?.label || mapInfo.field?.name || mapInfo.selector,
                currentValue: element?.value || '',
                newValue: validation.value !== undefined ? validation.value : value,
                valid: validation.valid,
                error: validation.error || null
            });

            if (!validation.valid) {
                warnings.push({ column, error: validation.error });
            }
        }

        return { preview, warnings };
    }

    /* ───── stop ───── */

    function stop() {
        if (abortController) abortController.aborted = true;
    }

    return { fillField, fillRow, fillBatch, preview, stop, removeAllHighlights };
})();
