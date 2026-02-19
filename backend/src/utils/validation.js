/**
 * Sanitizes a string by trimming and removing any HTML tags.
 * @param {string} str 
 * @param {number} maxLength 
 * @returns {string}
 */
export function sanitizeString(str, maxLength = 255) {
    if (typeof str !== 'string') return '';
    return str
        .trim()
        .replace(/<[^>]*>?/gm, '') // Basic HTML tag removal
        .substring(0, maxLength);
}

/**
 * Validates and sanitizes contact information (email, phone).
 * @param {Object} contact 
 * @returns {Object}
 */
export function validateContactInfo(contact) {
    const errors = [];
    if (!contact || typeof contact !== 'object') {
        return { isValid: false, errors: ['No contact information provided'] };
    }

    const email = sanitizeString(contact.email, 100);
    const phone = sanitizeString(contact.phone, 50);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
        errors.push('Email is required');
    } else if (!emailRegex.test(email)) {
        errors.push('Invalid email format');
    }

    // Phone is optional
    return {
        isValid: errors.length === 0,
        sanitized: { email, phone },
        errors
    };
}

/**
 * Sanitizes alphanumeric codes like currency symbols or network names.
 * @param {string} code 
 * @returns {string}
 */
export function sanitizeCode(code) {
    if (typeof code !== 'string') return '';
    return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').substring(0, 20);
}
