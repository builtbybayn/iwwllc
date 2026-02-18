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
 * Validates and sanitizes shipping information.
 * Returns an object with the results and any error messages.
 * @param {Object} shipping 
 * @returns {Object} { isValid: boolean, sanitized: Object, errors: string[] }
 */
export function validateShippingInfo(shipping) {
    const errors = [];
    if (!shipping || typeof shipping !== 'object') {
        return { isValid: false, errors: ['No shipping information provided'] };
    }

    const sanitized = {
        firstName: sanitizeString(shipping.firstName, 100),
        lastName: sanitizeString(shipping.lastName, 100),
        country: sanitizeString(shipping.country, 100),
        address1: sanitizeString(shipping.address1, 255),
        address2: sanitizeString(shipping.address2, 255),
        city: sanitizeString(shipping.city, 100),
        postalCode: sanitizeString(shipping.postalCode, 20)
    };

    if (!sanitized.firstName) errors.push('First name is required');
    if (!sanitized.lastName) errors.push('Last name is required');
    if (!sanitized.country) errors.push('Country is required');
    if (!sanitized.address1) errors.push('Address line 1 is required');
    if (!sanitized.city) errors.push('City is required');
    
    if (!sanitized.postalCode) {
        errors.push('Postal code is required');
    } else {
        // Specific validation for United States
        if (sanitized.country === 'United States') {
            const usZipRegex = /^\d{5}(-\d{4})?$/;
            if (!usZipRegex.test(sanitized.postalCode)) {
                errors.push('US Zip Code must be numeric (e.g., 12345)');
            }
        }
    }

    return {
        isValid: errors.length === 0,
        sanitized,
        errors
    };
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
        };}

/**
 * Sanitizes alphanumeric codes like currency symbols or network names.
 * @param {string} code 
 * @returns {string}
 */
export function sanitizeCode(code) {
    if (typeof code !== 'string') return '';
    return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').substring(0, 20);
}
