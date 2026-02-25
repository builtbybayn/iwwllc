import Fastify from 'fastify';
import dotenv from 'dotenv';
import { TelegramService } from './services/telegram.js';
import { log } from './utils/logger.js';
import { DB } from './db.js';
import { validateTelegramData } from './utils/auth.js';
import { sanitizeCode, validateContactInfo } from './utils/validation.js';
import { OxaPayService } from './services/oxapay.js';
import { GoogleService } from './services/google.js';
import Stripe from 'stripe';
import crypto from 'crypto';

import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
console.log('DEBUG: Backend starting... PORT:', process.env.PORT);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fastify = Fastify({
    logger: true, // Enable standard logging
    trustProxy: true 
});

// --- CONFIG ---
const PORT = process.env.PORT || 8080;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const OXAPAY_MERCHANT_KEY = process.env.OXAPAY_MERCHANT_KEY;
const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const FRONTEND_URL = process.env.WEB_APP_URL || 'http://localhost:5173';
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const ALLOWED_ORIGINS = [FRONTEND_URL, BACKEND_BASE_URL].filter(Boolean);

// Services
const telegramService = new TelegramService(TELEGRAM_BOT_TOKEN);
const oxapayService = new OxaPayService(OXAPAY_MERCHANT_KEY);
const googleService = new GoogleService();
const stripe = new Stripe(STRIPE_SECRET_KEY);

// --- PLUGINS ---
fastify.register(fastifyCors, {
    origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data']
});

// Serve Frontend Static Files
fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../../frontend/dist'),
    prefix: '/',
});

// Handle Frontend Routing
fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/v1')) {
        return reply.status(404).send({ error: 'API route not found' });
    }
    return reply.sendFile('index.html');
});

// --- MIDDLEWARE / HOOKS ---
fastify.addHook('preParsing', async (request, reply, payload) => {
    if (request.url === '/v1/payments/webhook/stripe' || request.url === '/v1/payments/webhook/oxapay') {
        const chunks = [];
        for await (const chunk of payload) {
            chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks);
        request.rawBody = rawBody;
        
        // Re-create the stream for the next parsers
        const { Readable } = await import('node:stream');
        return Readable.from(rawBody);
    }
    return payload;
});

fastify.addHook('onRequest', async (request, reply) => {
    // Log basic info for every request
    log('INFO', `${request.method} ${request.url}`);

    const publicRoutes = ['/', '/healthz', '/v1/telegram/webhook', '/v1/payments/webhook/oxapay'];
    const isStaticAsset = /\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|otf)$/i.test(request.url) || request.url.startsWith('/assets/');
    
    if (publicRoutes.includes(request.url) || isStaticAsset) return;

    // Public API Routes (Job and Order routes are public for the customer)
    const publicApiRoutes = ['/v1/jobs', '/v1/orders', '/v1/payments/currencies'];
    const isPublicApiRoute = publicApiRoutes.some(route => request.url.startsWith(route));
    
    if (isPublicApiRoute) return;

    // Optional: Web App Routes (Requires Init Data Signature)
    // We've moved currencies to public, so this part might be empty for now
    // but kept for future restricted routes.
});

// --- ROUTES ---
fastify.get('/healthz', async () => {
    return { ok: true, version: "1.0.0" };
});

fastify.get('/v1/payments/currencies', async (request, reply) => {
    try {
        log('INFO', 'Fetching currencies from OxaPay');
        const currencies = await oxapayService.getSupportedCurrencies();
        return { status: 'ok', currencies };
    } catch (err) {
        log('ERROR', 'Failed to fetch currencies', { error: err.message });
        return reply.status(500).send({ status: 'error', message: err.message });
    }
});

fastify.get('/v1/jobs/:id', async (request, reply) => {
    const jobId = request.params.id;
    log('INFO', `Fetching job details for: ${jobId}`);
    const job = DB.getJob(jobId);
    if (!job) {
        log('WARN', `Job not found in database: ${jobId}`);
        return reply.status(404).send({ status: 'error', message: 'Job not found' });
    }
    log('INFO', `Job found: ${jobId}`, { amount: job.amount });
    return { status: 'ok', job };
});

fastify.get('/v1/orders/:id', async (request, reply) => {
    const orderId = request.params.id;
    const order = DB.getOrder(orderId);
    if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
    }
    
    return { 
        status: order.status,
        id: order.id,
        payAmount: order.pay_amount,
        address: order.pay_address,
        payAddress: order.pay_address,
        payCurrency: order.pay_currency,
        networkName: order.network_name,
        qrcode: order.qrcode,
        expiredAt: order.expired_at,
        payLink: order.external_id ? `https://pay.oxapay.com/redirect/${order.external_id}` : null
    };
});

fastify.post('/v1/orders', async (request, reply) => {
    const { paymentMethod, jobId, tipAmount, contact } = request.body || {};
    
    const contactValidation = validateContactInfo(contact);
    if (!contactValidation.isValid) {
        return reply.status(400).send({ 
            status: 'error', 
            message: contactValidation.errors.join(', ') 
        });
    }

    const job = jobId ? DB.getJob(jobId) : null;
    let priceUSD = job ? job.amount : parseFloat(process.env.PRODUCT_PRICE || "399");
    const tip = parseFloat(tipAmount || 0);

    let discount = 0;
    // Apply 5% discount for crypto (only on base price)
    if (paymentMethod === 'crypto') {
        discount = priceUSD * 0.05;
    }

    const finalPriceUSD = parseFloat((priceUSD - discount + tip).toFixed(2));

    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    let payAmountUSD = finalPriceUSD;

    try {
        DB.createOrder({
            id: orderId,
            jobId: jobId,
            amount: payAmountUSD,
            tipAmount: tip,
            currency: 'USD',
            email: contactValidation.sanitized.email,
            phone: contactValidation.sanitized.phone
        });
        return { status: 'ok', orderId };
    } catch (err) {
        log('ERROR', 'Failed to create order', { orderId, error: err.message });
        return reply.status(500).send({ status: 'error', message: err.message });
    }
});

fastify.post('/v1/orders/:id/payments/oxapay', async (request, reply) => {
    let { currency, network } = request.body || {};
    currency = sanitizeCode(currency);
    network = sanitizeCode(network);

    if (!currency || !network) {
        return reply.status(400).send({ status: 'error', message: 'Invalid currency or network' });
    }

    const orderId = request.params.id;
    const order = DB.getOrder(orderId);

    if (!order) {
        return reply.status(404).send({ error: 'Order not found' });
    }

    try {
        let cleanBaseUrl = (BACKEND_BASE_URL || 'http://localhost').replace(/\/$/, '');
        if (!cleanBaseUrl.startsWith('http')) {
            cleanBaseUrl = `https://${cleanBaseUrl}`;
        }
        
        const callbackUrl = `${cleanBaseUrl}/v1/payments/webhook/oxapay`;
        
        const invoice = await oxapayService.createInvoice(
            order.amount,
            currency,
            network,
            orderId,
            callbackUrl
        );

        DB.updateOrderPayment(orderId, {
            externalId: invoice.invoiceId,
            payAmount: invoice.payAmount,
            payAddress: invoice.address,
            payCurrency: invoice.payCurrency,
            qrcode: invoice.qrcode,
            networkName: invoice.networkName,
            expiredAt: invoice.expiredAt
        });

        return { status: 'ok', ...invoice };
    } catch (err) {
        log('ERROR', 'OxaPay payment initialization failed', { orderId, error: err.message });
        return reply.status(500).send({ status: 'error', message: err.message });
    }
});

fastify.post('/v1/payments/webhook/oxapay', async (request, reply) => {
    const signature = request.headers['hmac'];
    const merchantKey = process.env.OXAPAY_MERCHANT_KEY;
    const rawBody = request.rawBody;

    if (!rawBody || !merchantKey || !signature) {
        return reply.status(400).send('invalid signature');
    }

    const computed = crypto
        .createHmac('sha512', merchantKey)
        .update(rawBody)
        .digest('hex');

    if (computed !== signature) {
        return reply.status(400).send('invalid signature');
    }

    const data = request.body;
    if (data.status === 'paid' || data.status === 'confirmed') {
        DB.updateOrderStatus(data.trackId, 'paid', true);
        
        // Update Google Sheets
        const order = DB.getOrderByExternalId(data.trackId);
        if (order && order.job_id) {
            await googleService.updateInvoiceStatus(GOOGLE_SHEET_ID, order.job_id, 'PAID');
        }
    } else if (data.status === 'expired') {
        DB.updateOrderStatus(data.trackId, 'expired', true);
    }
    return 'ok';
});

fastify.post('/v1/payments/stripe/create-checkout-session', async (request, reply) => {
    try {
        const { orderId, customerEmail } = request.body || {};
        if (!orderId) {
            return reply.status(400).send({ status: 'error', message: 'Missing orderId' });
        }

        const order = DB.getOrder(orderId);
        if (!order) {
            return reply.status(404).send({ status: 'error', message: 'Order not found' });
        }

        const job = order.job_id ? DB.getJob(order.job_id) : null;
        const totalAmount = parseFloat(order.amount || 0);
        const tipAmount = parseFloat(order.tip_amount || 0);
        const baseAmount = totalAmount - tipAmount;
        if (!totalAmount || Number.isNaN(totalAmount) || baseAmount < 0) {
            return reply.status(400).send({ status: 'error', message: 'Invalid order amount' });
        }

        const unitAmount = Math.round(totalAmount * 100);

        log('INFO', 'Creating Stripe Checkout Session', { orderId, total: totalAmount });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: job?.description || process.env.PRODUCT_NAME || 'Window Cleaning Service',
                            description: `Service: $${baseAmount} + Tip: $${tipAmount}`,
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: 1,
                },
            ],
            customer_email: order.email || customerEmail,
            mode: 'payment',
            success_url: `${FRONTEND_URL}/?jobId=${order.job_id || ''}&view=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${FRONTEND_URL}/?jobId=${order.job_id || ''}&view=payment`,
            metadata: {
                order_id: orderId,
                service_amount: baseAmount,
                tip_amount: tipAmount,
                description: job?.description || process.env.PRODUCT_NAME || 'Window Cleaning Service'
            }
        });

        return { status: 'ok', url: session.url };
    } catch (err) {
        log('ERROR', 'Stripe session creation failed', { error: err.message });
        return reply.status(500).send({ status: 'error', message: err.message });
    }
});

fastify.post('/v1/payments/webhook/stripe', async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Use the raw body buffer captured in the preParsing hook
        event = stripe.webhooks.constructEvent(request.rawBody, sig, endpointSecret);
    } catch (err) {
        log('ERROR', 'Stripe Webhook Signature Verification Failed', { error: err.message });
        return reply.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const orderId = session.metadata.order_id;
        
        log('INFO', 'Stripe Checkout Session Completed', { orderId, email: session.customer_details.email });
        
        // Update order status
        DB.updateOrderStatus(orderId, 'paid');

        // Update Google Sheets
        const order = DB.getOrder(orderId);
        if (order && order.job_id) {
            await googleService.updateInvoiceStatus(GOOGLE_SHEET_ID, order.job_id, 'PAID');
        }
        
        // In a real app, trigger receipt email here
        // sendReceiptEmail(session.customer_details.email, session.metadata);
    }

    return { received: true };
});

fastify.post('/v1/telegram/webhook', async (request, reply) => {
    if (TELEGRAM_WEBHOOK_SECRET) {
        const signature = request.headers['x-telegram-bot-api-secret-token'];
        if (signature !== TELEGRAM_WEBHOOK_SECRET) {
            return reply.code(403).send({ status: 'error', message: 'Unauthorized' });
        }
    }
    try {
        await telegramService.processWebhookUpdate(request.body);
        return { ok: true };
    } catch (e) {
        log('ERROR', 'Webhook processing failed', { error: e.message });
        return { ok: false };
    }
});

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        log('INFO', `Server listening on port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
