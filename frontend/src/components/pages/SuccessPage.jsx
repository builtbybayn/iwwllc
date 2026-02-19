import React from 'react';
import { cartIcon, PRODUCT_NAME } from '../../constants';

const SuccessPage = () => (
  <>
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: '24px' }}>
      <div className="success-icon">
        <img src={cartIcon} style={{ width: 40, height: 40, filter: 'brightness(0) invert(1)' }} alt="cart" />
      </div>
    </div>
    <h1>Payment Received!</h1>
    <p style={{ color: 'var(--color-text-secondary)', padding: '0 20px', marginTop: 12, lineHeight: '1.6' }}>
      Your payment for {PRODUCT_NAME} has been successfully processed. Thank you for your business!
    </p>
    
    <div style={{ 
      margin: '32px auto 0 auto', 
      padding: '20px', 
      backgroundColor: 'rgba(255,255,255,0.03)', 
      borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.05)',
      width: '100%',
      maxWidth: '300px',
      textAlign: 'center'
    }}>
      <div style={{ fontWeight: '600', marginBottom: '8px' }}>What's Next?</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: '14px' }}>
        You will receive a receipt via email shortly. You can now safely close this window.
      </div>
    </div>

    <div className="continue-button-container" style={{ marginTop: 'auto' }}>
      <button className="continue-button" onClick={() => {
        const isTelegram = window.Telegram?.WebApp?.initData !== '';
        if (isTelegram && window.Telegram?.WebApp?.close) {
          window.Telegram.WebApp.close();
        } else {
          window.location.href = 'https://iwwllc.com'; 
        }
      }}>
        Done
      </button>
    </div>
  </>
);

export default SuccessPage;
