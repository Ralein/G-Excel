/**
 * Mapping orchestrator — merges smart-matched, manual, and saved-profile mappings.
 */
const Mapper = (() => {
    /**
     * Build a full mapping by merging auto-suggestions with manual overrides.
     * @param {Object} autoMapping   - From Matcher.autoMap()
     * @param {Object} manualMapping - User overrides { columnName: selector }
     * @param {Object[]} fields      - All detected form fields
     * @returns {Object} merged mapping { columnName: { selector, confidence, level, source } }
     */
    function mergeMappings(autoMapping, manualMapping, fields) {
        const result = {};

        // Start with auto-mapping
        for (const [col, info] of Object.entries(autoMapping || {})) {
            result[col] = { ...info, source: 'auto' };
        }

        // Override with manual selections
        for (const [col, selector] of Object.entries(manualMapping || {})) {
            if (!selector) {
                // User explicitly unmapped this column
                delete result[col];
                continue;
            }
            const field = fields.find(f => f.selector === selector);
            result[col] = {
                field: field || null,
                selector,
                confidence: 1.0,
                level: 'high',
                source: 'manual'
            };
        }

        return result;
    }

    /**
     * Apply a saved profile's mapping, re-checking that selectors still exist.
     * @param {Object} profileMapping - Saved mapping from profile
     * @param {Object[]} fields       - Currently detected form fields
     * @returns {Object} validated mapping
     */
    function applySavedProfile(profileMapping, fields) {
        const result = {};
        const fieldSelectors = new Set(fields.map(f => f.selector));

        for (const [col, info] of Object.entries(profileMapping || {})) {
            const selector = info.selector || info;
            if (fieldSelectors.has(selector)) {
                const field = fields.find(f => f.selector === selector);
                result[col] = {
                    field,
                    selector,
                    confidence: info.confidence || 0.9,
                    level: 'high',
                    source: 'profile'
                };
            }
            // If selector no longer exists on page, skip it
        }

        return result;
    }

    /**
     * Convert mapping to a saveable format (strip DOM references).
     * @param {Object} mapping
     * @returns {Object} serializable mapping
     */
    function toSerializable(mapping) {
        const result = {};
        for (const [col, info] of Object.entries(mapping)) {
            result[col] = {
                selector: info.selector,
                confidence: info.confidence,
                level: info.level
            };
        }
        return result;
    }

    return { mergeMappings, applySavedProfile, toSerializable };
})();
