import React, { useState } from 'react';
import { triggerHaptic } from '../../utils';

const ContactInfoPage = ({ onBack, onContinue }) => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const handleContinue = () => {
    triggerHaptic('light');
    onContinue({ email, phone: phone || '' });
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(email);

  return (
    <>
      <div className="view-header">
        <button className="back-button" onClick={() => { triggerHaptic('light'); onBack(); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 style={{ margin: 0 }}>Your Info</h2>
      </div>

      <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
        Enter your details so we can send you a receipt and contact you if needed.
      </p>

      <div className="form-group" style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Email Address</label>
        <input 
          type="email" 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            border: isEmailValid || !email ? '1px solid rgba(255,255,255,0.1)' : '1px solid #ff4d4d',
            background: 'var(--color-card-dark)',
            color: '#fff',
            fontSize: '16px',
            outline: 'none'
          }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>Phone Number <span style={{ opacity: 0.5, fontWeight: '400', fontSize: '13px' }}>(Optional)</span></label>
        <input 
          type="tel" 
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 (555) 000-0000"
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'var(--color-card-dark)',
            color: '#fff',
            fontSize: '16px',
            outline: 'none'
          }}
        />
      </div>

      <div className="continue-button-container">
        <button 
          className="continue-button" 
          onClick={handleContinue}
          disabled={!isEmailValid}
        >
          Continue
        </button>
      </div>
    </>
  );
};

export default ContactInfoPage;
