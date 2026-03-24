import { fetch } from 'undici';
import { log } from '../utils/logger.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMoney(amount) {
    const parsed = parseFloat(amount || 0);
    return Number.isFinite(parsed) ? `$${parsed.toFixed(2)}` : '$0.00';
}

function buildReceiptHtml({
    orderId,
    customerEmail,
    paymentMethod,
    paidAt,
    serviceDescription,
    serviceAmount,
    tipAmount,
    totalAmount
}) {
    const safePaymentMethod = escapeHtml(paymentMethod);
    const safeOrderId = escapeHtml(orderId);
    const safeCustomerEmail = escapeHtml(customerEmail);
    const safePaidAt = escapeHtml(paidAt);
    const safeServiceDescription = escapeHtml(serviceDescription);

    return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:#111111;color:#ffffff;padding:24px 28px;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.8;">Island Window Wizards LLC</div>
                <h1 style="margin:10px 0 0;font-size:26px;line-height:1.2;">Payment Receipt</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Your payment was received successfully. Keep this email for your records.</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Receipt ID</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${safeOrderId}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Date Paid</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${safePaidAt}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Customer Email</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${safeCustomerEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Payment Method</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${safePaymentMethod}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Service</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${safeServiceDescription}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Service Amount</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatMoney(serviceAmount)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;">Tip</td>
                    <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatMoney(tipAmount)}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 0 0;font-size:18px;font-weight:700;">Total Paid</td>
                    <td style="padding:14px 0 0;text-align:right;font-size:18px;font-weight:700;">${formatMoney(totalAmount)}</td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">Thank you for choosing Island Window Wizards LLC.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    `.trim();
}

export class EmailService {
    constructor({
        apiKey = process.env.RESEND_API_KEY,
        from = process.env.RESEND_FROM_EMAIL,
        replyTo = process.env.RESEND_REPLY_TO
    } = {}) {
        this.apiKey = apiKey;
        this.from = from;
        this.replyTo = replyTo;
        this.enabled = !!(this.apiKey && this.from);
    }

    async sendPaymentReceipt({
        orderId,
        customerEmail,
        paymentMethod,
        serviceDescription,
        serviceAmount,
        tipAmount,
        totalAmount,
        paidAt
    }) {
        if (!this.enabled) {
            log('WARN', 'Receipt email skipped because email service is not configured', { orderId });
            return { skipped: true };
        }

        if (!customerEmail) {
            log('WARN', 'Receipt email skipped because customer email is missing', { orderId });
            return { skipped: true };
        }

        const html = buildReceiptHtml({
            orderId,
            customerEmail,
            paymentMethod,
            paidAt,
            serviceDescription,
            serviceAmount,
            tipAmount,
            totalAmount
        });

        const body = {
            from: this.from,
            to: [customerEmail],
            subject: 'Payment Receipt - Island Window Wizards LLC',
            html,
            tags: [
                { name: 'category', value: 'payment_receipt' },
                { name: 'order_id', value: String(orderId).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 256) }
            ]
        };

        if (this.replyTo) {
            body.replyTo = this.replyTo;
        }

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': `receipt-${orderId}`
            },
            body: JSON.stringify(body)
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = payload?.message || payload?.error || `HTTP ${response.status}`;
            throw new Error(`Resend send failed: ${message}`);
        }

        log('INFO', 'Receipt email sent', { orderId, emailId: payload.id, customerEmail });
        return payload;
    }
}
