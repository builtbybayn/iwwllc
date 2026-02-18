import React from 'react';

const TimeoutPage = ({ onBack }) => (
  <>
    <div className="success-icon" style={{ backgroundColor: '#ff4444', boxShadow: '0 0 30px rgba(255, 68, 68, 0.4)' }}>⏳</div>
    <h1>Session Expired</h1>
    <p style={{ color: 'var(--color-text-secondary)', padding: '0 20px', marginTop: 12 }}>
      The payment window has closed. Any funds sent after this point may be lost. Please go back and try again.
    </p>
    <div className="continue-button-container" style={{ marginTop: 'auto' }}>
      <button className="continue-button" onClick={onBack}>
        Go Back
      </button>
    </div>
  </>
);

export default TimeoutPage;
