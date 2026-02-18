import React from 'react';
import { cartIcon, PRODUCT_NAME } from '../../constants';

const SuccessPage = () => (
  <>
    <div className="success-icon">
      <img src={cartIcon} style={{ width: 44, height: 44, filter: 'brightness(0) invert(1)' }} alt="cart" />
    </div>
    <h1>Payment Received!</h1>
    <p style={{ color: 'var(--color-text-secondary)', padding: '0 20px', marginTop: 12 }}>
      Your payment for {PRODUCT_NAME} has been received. Thank you for your business!
    </p>
    <div className="continue-button-container" style={{ marginTop: 'auto' }}>
      <button className="continue-button" onClick={() => window.Telegram.WebApp.close()}>
        Close
      </button>
    </div>
  </>
);

export default SuccessPage;
