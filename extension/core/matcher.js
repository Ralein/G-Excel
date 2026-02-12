/**
 * Smart matching algorithm — multi-factor weighted scoring
 * to match Excel columns to form fields.
 */
const Matcher = (() => {
    /* ───── confidence thresholds ───── */
    const CONFIDENCE = { HIGH: 0.75, MEDIUM: 0.5, LOW: 0.25 };

    /* ───── string utilities ───── */

    /** Normalize: lowercase, replace separators with space, trim */
    function normalize(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .replace(/[_\-\.]+/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase split
            .replace(/\s+/g, ' ')
            .trim();
    }

    /** Tokenize a string into individual words */
    function tokenize(str) {
        return normalize(str).split(/\s+/).filter(Boolean);
    }

    /** Levenshtein distance */
    function levenshtein(a, b) {
        if (!a || !b) return Math.max((a || '').length, (b || '').length);
        const la = a.length, lb = b.length;
        const dp = Array.from({ length: la + 1 }, (_, i) => {
            const row = new Array(lb + 1);
            row[0] = i;
            return row;
        });
        for (let j = 0; j <= lb; j++) dp[0][j] = j;
        for (let i = 1; i <= la; i++) {
            for (let j = 1; j <= lb; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
            }
        }
        return dp[la][lb];
    }

    /** Similarity score 0-1 based on Levenshtein */
    function stringSimilarity(a, b) {
        const na = normalize(a);
        const nb = normalize(b);
        if (na === nb) return 1.0;
        if (!na || !nb) return 0;
        const maxLen = Math.max(na.length, nb.length);
        if (maxLen === 0) return 1.0;
        return 1 - levenshtein(na, nb) / maxLen;
    }

    /** Token overlap score: percentage of tokens in common */
    function tokenOverlap(a, b) {
        const tokA = tokenize(a);
        const tokB = tokenize(b);
        if (tokA.length === 0 || tokB.length === 0) return 0;
        const setB = new Set(tokB);
        const matches = tokA.filter(t => setB.has(t)).length;
        return matches / Math.max(tokA.length, tokB.length);
    }

    /** Combined string comparison: best of exact, token, and fuzzy */
    function compareStrings(a, b) {
        if (!a || !b) return 0;
        const exact = stringSimilarity(a, b);
        const token = tokenOverlap(a, b);
        return Math.max(exact, token);
    }

    /* ───── matching factors ───── */

    /** Factor 1 (40%): Column name vs field name/id */
    function nameScore(column, field) {
        let best = 0;
        if (field.name) best = Math.max(best, compareStrings(column, field.name));
        if (field.id) best = Math.max(best, compareStrings(column, field.id));
        return best;
    }

    /** Factor 2 (25%): Column name vs label text */
    function labelScore(column, field) {
        if (!field.label) return 0;
        return compareStrings(column, field.label);
    }

    /** Factor 3 (20%): Attribute matching */
    function attributeScore(column, field) {
        let best = 0;
        const colNorm = normalize(column);
        const attrs = [field.ariaLabel, field.placeholder, field.title].filter(Boolean);
        for (const attr of attrs) {
            best = Math.max(best, compareStrings(colNorm, attr));
        }
        // Check data-* attrs
        if (field.dataAttrs) {
            for (const val of Object.values(field.dataAttrs)) {
                best = Math.max(best, compareStrings(colNorm, String(val)));
            }
        }
        return best;
    }

    /** Factor 4 (10%): Synonym matching */
    function synonymScore(column, field) {
        if (typeof areSynonyms !== 'function') return 0;
        const fieldsToCheck = [field.name, field.id, field.label, field.ariaLabel, field.placeholder].filter(Boolean);
        for (const fv of fieldsToCheck) {
            if (areSynonyms(column, fv)) return 1.0;
        }
        // Also check canonical
        if (typeof findCanonical === 'function') {
            const colCanon = findCanonical(column);
            if (colCanon) {
                for (const fv of fieldsToCheck) {
                    const fvCanon = findCanonical(fv);
                    if (fvCanon && colCanon === fvCanon) return 1.0;
                }
            }
        }
        return 0;
    }

    /** Factor 5 (5%): Data type compatibility */
    function typeScore(columnType, field) {
        if (!columnType) return 0;
        const typeMap = {
            email: ['email'],
            phone: ['tel'],
            number: ['number', 'range'],
            date: ['date', 'datetime-local'],
            url: ['url'],
            text: ['text', 'textarea', 'password']
        };
        const fieldType = (field.type || 'text').toLowerCase();
        for (const [dataType, htmlTypes] of Object.entries(typeMap)) {
            if (columnType === dataType && htmlTypes.includes(fieldType)) return 1.0;
        }
        return 0;
    }

    /* ───── main scoring ───── */

    /**
     * Calculate match score between an Excel column and a form field.
     * @param {string} columnName
     * @param {Object} formField
     * @param {string} [columnDataType] - Inferred data type of column data
     * @returns {number} Score 0.0 – 1.0
     */
    function calculateMatchScore(columnName, formField, columnDataType) {
        let score = 0;
        score += nameScore(columnName, formField) * 0.40;
        score += labelScore(columnName, formField) * 0.25;
        score += attributeScore(columnName, formField) * 0.20;
        score += synonymScore(columnName, formField) * 0.10;
        score += typeScore(columnDataType, formField) * 0.05;
        return Math.min(score, 1.0);
    }

    /**
     * Auto-map all columns to best-matching fields.
     * @param {string[]} columns - Excel column names
     * @param {Object[]} fields  - Detected form fields
     * @param {Object} [dataTypes] - Column name → inferred type map
     * @returns {Object} { columnName: { field, selector, confidence, level } }
     */
    function autoMap(columns, fields, dataTypes) {
        const mapping = {};
        const usedFields = new Set();

        // Score every (column, field) pair
        const pairs = [];
        for (const col of columns) {
            for (const field of fields) {
                const score = calculateMatchScore(col, field, dataTypes?.[col]);
                pairs.push({ column: col, field, score });
            }
        }

        // Sort by score desc, greedily assign
        pairs.sort((a, b) => b.score - a.score);
        for (const p of pairs) {
            if (mapping[p.column] || usedFields.has(p.field.selector)) continue;
            if (p.score < CONFIDENCE.LOW) continue;  // Skip very low scores

            const level = p.score >= CONFIDENCE.HIGH ? 'high'
                : p.score >= CONFIDENCE.MEDIUM ? 'medium' : 'low';

            mapping[p.column] = {
                field: p.field,
                selector: p.field.selector,
                confidence: p.score,
                level
            };
            usedFields.add(p.field.selector);
        }
        return mapping;
    }

    /**
     * Get confidence level string.
     */
    function getConfidenceLevel(score) {
        if (score >= CONFIDENCE.HIGH) return 'high';
        if (score >= CONFIDENCE.MEDIUM) return 'medium';
        return 'low';
    }

    return { calculateMatchScore, autoMap, getConfidenceLevel, stringSimilarity, normalize, CONFIDENCE };
})();
