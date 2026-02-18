import crypto from 'crypto';

/**
 * Validates the initData sent from Telegram Web App
 * @param {string} initData - The raw query string from window.Telegram.WebApp.initData
 * @param {string} botToken - Your Telegram Bot Token
 * @returns {boolean} - True if valid, False if forged or expired
 */
export function validateTelegramData(initData, botToken) {
    if (!initData) return false;

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) return false;

    urlParams.delete('hash');

    // Telegram requires sorting keys alphabetically
    const params = [];
    for (const [key, value] of urlParams.entries()) {
        params.push(`${key}=${value}`);
    }
    params.sort();
    
    const dataCheckString = params.join('\n');
    
    // Create the secret key using WebAppData + BotToken
    const secretKey = crypto.createHmac('sha256', 'WebAppData')
        .update(botToken)
        .digest();
        
    // Calculate the hash
    const calculatedHash = crypto.createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');
        
    return calculatedHash === hash;
}
