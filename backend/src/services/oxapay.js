import { log } from '../utils/logger.js';

export class OxaPayService {
    constructor(merchantKey) {
        this.merchantKey = merchantKey;
        this.baseUrl = 'https://api.oxapay.com/merchants';
    }

    /**
     * Fetches supported currencies and their networks
     */
    async getSupportedCurrencies() {
        // Try common currencies first
        const urls = [
            'https://api.oxapay.com/v1/common/currencies'
        ];

        let lastError = null;

        for (const url of urls) {
            try {
                console.log(`[OxaPay] Attempting to fetch from: ${url}`);
                const response = await fetch(url);
                
                if (!response.ok) {
                    const text = await response.text();
                    console.error(`[OxaPay] HTTP Error ${response.status}: ${text}`);
                    continue;
                }

                const data = await response.json();
                
                // Based on logs, the success indicator is status: 200 and data is in 'data'
                if (data.status === 200 && data.data) {
                    return data.data;
                }
                
                // Fallback for different API version just in case
                if (data.result === 100 && data.currencies) {
                    return data.currencies;
                }

                console.warn(`[OxaPay] API returned unexpected format:`, data);
            } catch (error) {
                console.error(`[OxaPay] Exception for ${url}:`, error.message);
                lastError = error;
            }
        }

        log('ERROR', 'OxaPay Fetch Currencies Failed after all attempts', { 
            error: lastError?.message
        });
        
        throw lastError || new Error('Failed to fetch currencies from OxaPay');
    }

    /**
     * Creates a new crypto invoice using the White Label endpoint
     * @param {number} amount - Amount in USD (or your base currency)
     * @param {string} currency - The crypto currency (e.g., BTC, SOL, USDT)
     * @param {string} network - The network (e.g., TRC20, SOLANA, ERC20)
     * @param {string} orderId - Your internal order ID
     * @returns {Promise<Object>} - The invoice data (address, amount, etc.)
     */
    async createInvoice(amount, currency, network, orderId, callbackUrl) {
        try {
            // White Label API expects snake_case and uses Header for Merchant Key
            const requestBody = {
                amount: amount,
                currency: 'USD', // Base currency
                pay_currency: currency,
                network: network,
                order_id: orderId,
                callback_url: callbackUrl,
                description: `Order ${orderId}`,
                fee_paid_by_payer: 1, // Payer covers the processing fee
                under_paid_coverage: 5, // Allow 5% margin for exchange rate shifts
                lifetime: 60 // 1 hour to pay
            };

            log('INFO', 'OxaPay Requesting White Label Invoice', { 
                url: 'https://api.oxapay.com/v1/payment/white-label',
                requestBody 
            });

            const response = await fetch('https://api.oxapay.com/v1/payment/white-label', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'merchant_api_key': this.merchantKey 
                },
                body: JSON.stringify(requestBody)
            });

            const json = await response.json();

            // The White Label API returns status 200 on success
            if (json.status !== 200 || !json.data) {
                throw new Error(json.message || json.error?.message || 'OxaPay White Label Error');
            }

            const data = json.data;

            // Round amount to 6 decimals for a cleaner UI (most cryptos don't need 18)
            const displayAmount = Number(data.pay_amount).toFixed(6).replace(/\.?0+$/, '');

            return {
                address: data.address,
                payAmount: displayAmount,
                payCurrency: (data.pay_currency || currency).toUpperCase(),
                networkName: data.network,
                invoiceId: data.track_id,
                qrcode: data.qr_code,
                expiredAt: data.expired_at
            };
        } catch (error) {
            log('ERROR', 'OxaPay Create White Label Invoice Failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Fetches details for an existing order/invoice
     */
    async getOrderDetails(trackId) {
        try {
            const response = await fetch(`${this.baseUrl}/get-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    merchant: this.merchantKey,
                    trackId: trackId
                })
            });

            const data = await response.json();
            if (data.result === 100) {
                return data;
            }
            return null;
        } catch (error) {
            console.error('[OxaPay] getOrderDetails Error:', error.message);
            return null;
        }
    }
}
