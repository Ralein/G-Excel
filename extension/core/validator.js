/**
 * Field validation rules by type.
 * Each validator returns { valid: boolean, error?: string, value?: any }
 */
const Validator = (() => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function validateRequired(value, field) {
        if (field.required && (value === null || value === undefined || String(value).trim() === '')) {
            return { valid: false, error: 'Required field cannot be empty' };
        }
        return { valid: true };
    }

    function validateEmail(value) {
        if (!value || String(value).trim() === '') return { valid: true, value };
        if (!EMAIL_REGEX.test(String(value).trim())) {
            return { valid: false, error: 'Invalid email format' };
        }
        return { valid: true, value: String(value).trim() };
    }

    function validatePhone(value) {
        if (!value || String(value).trim() === '') return { valid: true, value };
        const cleaned = String(value).replace(/\D/g, '');
        if (cleaned.length < 7 || cleaned.length > 15) {
            return { valid: false, error: `Invalid phone length (${cleaned.length} digits)` };
        }
        return { valid: true, value: String(value).trim() };
    }

    function validateNumber(value, field) {
        if (value === null || value === undefined || String(value).trim() === '') {
            return { valid: true, value: '' };
        }
        const num = parseFloat(value);
        if (isNaN(num)) {
            return { valid: false, error: 'Not a valid number' };
        }
        const min = field.min !== undefined && field.min !== null ? parseFloat(field.min) : null;
        const max = field.max !== undefined && field.max !== null ? parseFloat(field.max) : null;

        if (min !== null && !isNaN(min) && num < min) {
            return { valid: false, error: `Below minimum (${min})` };
        }
        if (max !== null && !isNaN(max) && num > max) {
            return { valid: false, error: `Above maximum (${max})` };
        }
        return { valid: true, value: num };
    }

    function validateDate(value) {
        if (!value || String(value).trim() === '') return { valid: true, value: '' };
        const str = String(value).trim();

        // Try parsing as Date
        let date = new Date(str);

        // Handle Excel serial dates (numbers like 45678)
        if (isNaN(date.getTime()) && !isNaN(parseFloat(str))) {
            const serial = parseFloat(str);
            // Excel epoch: 1900-01-01, but Excel has a bug treating 1900 as a leap year
            const epoch = new Date(1899, 11, 30);
            date = new Date(epoch.getTime() + serial * 86400000);
        }

        if (isNaN(date.getTime())) {
            return { valid: false, error: 'Invalid date format' };
        }

        // Format for input[type="date"] → YYYY-MM-DD
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return { valid: true, value: `${yyyy}-${mm}-${dd}` };
    }

    function validateSelect(value, options) {
        if (!value || String(value).trim() === '') return { valid: true, value: '' };
        if (!options || options.length === 0) return { valid: true, value };

        const strVal = String(value).trim().toLowerCase();

        // Try exact value match
        let match = options.find(o => String(o.value).toLowerCase() === strVal);
        if (match) return { valid: true, value: match.value };

        // Try text match
        match = options.find(o => String(o.text).trim().toLowerCase() === strVal);
        if (match) return { valid: true, value: match.value };

        // Try partial / contains match
        match = options.find(o =>
            String(o.text).toLowerCase().includes(strVal) ||
            strVal.includes(String(o.text).trim().toLowerCase())
        );
        if (match) return { valid: true, value: match.value };

        return { valid: false, error: `"${value}" not in dropdown options` };
    }

    function validateUrl(value) {
        if (!value || String(value).trim() === '') return { valid: true, value: '' };
        const str = String(value).trim();
        try {
            new URL(str);
            return { valid: true, value: str };
        } catch {
            // Try adding https://
            try {
                new URL('https://' + str);
                return { valid: true, value: 'https://' + str };
            } catch {
                return { valid: false, error: 'Invalid URL format' };
            }
        }
    }

    /**
     * Validate a value for a given field.
     * @param {*} value - The value to validate
     * @param {Object} field - The form field descriptor
     * @returns {{ valid: boolean, error?: string, value?: any }}
     */
    function validate(value, field) {
        // Required check first
        const reqCheck = validateRequired(value, field);
        if (!reqCheck.valid) return reqCheck;

        const type = (field.type || 'text').toLowerCase();

        switch (type) {
            case 'email':
                return validateEmail(value);
            case 'tel':
                return validatePhone(value);
            case 'number':
            case 'range':
                return validateNumber(value, field);
            case 'date':
            case 'datetime-local':
                return validateDate(value);
            case 'select':
            case 'select-one':
            case 'select-multiple':
                return validateSelect(value, field.options);
            case 'url':
                return validateUrl(value);
            default:
                return { valid: true, value: value };
        }
    }

    return { validate, validateRequired, validateEmail, validatePhone, validateNumber, validateDate, validateSelect, validateUrl };
})();
