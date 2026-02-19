import React, { useState } from 'react';
import { triggerHaptic } from '../../utils';

const TipPage = ({ onBack, onContinue, baseAmount }) => {
  const [selectedTip, setSelectedTip] = useState(null);
  const [customTipCents, setCustomTipCents] = useState(0);
  const [isCustom, setIsCustom] = useState(false);

  const tips = [
    { label: '10%', value: baseAmount * 0.10 },
    { label: '20%', value: baseAmount * 0.20 },
    { label: '25%', value: baseAmount * 0.25 },
    { label: 'No thanks', value: 0 }
  ];

  const handleContinue = () => {
    triggerHaptic('light');
    let finalTip = 0;
    if (isCustom) {
      finalTip = customTipCents / 100;
    } else if (selectedTip !== null) {
      finalTip = selectedTip;
    }
    onContinue(finalTip);
  };

  const handleSelectTip = (val) => {
    triggerHaptic('selection');
    setSelectedTip(val);
    setIsCustom(false);
  };

  const handleSelectCustom = () => {
    triggerHaptic('selection');
    setIsCustom(true);
    setSelectedTip(null);
  };

  const handleCustomInputChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits.length <= 7) {
      setCustomTipCents(parseInt(digits || '0', 10));
    }
  };

  const formatDisplay = (cents) => {
    return (cents / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalAmount = baseAmount + (isCustom ? (customTipCents / 100) : (selectedTip || 0));

  return (
    <>
      <div className="view-header">
        <button className="back-button" onClick={() => { triggerHaptic('light'); onBack(); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 style={{ margin: 0 }}>Add Tip?</h2>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
          A tip is not expected but is greatly appreciated.
        </p>

        <div className="crypto-list" style={{ gap: '16px', paddingTop: '8px' }}>
          {tips.map((tip, idx) => (
            <div 
              key={idx}
              className={`crypto-card ${!isCustom && selectedTip === tip.value ? 'selected' : ''}`}
              onClick={() => handleSelectTip(tip.value)}
            >
              <div className="crypto-name" style={{ fontSize: '22px', fontWeight: '700' }}>{tip.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {tip.value > 0 && (
                  <div style={{ 
                    fontSize: '17px', 
                    fontWeight: '600', 
                    opacity: !isCustom && selectedTip === tip.value ? 1 : 0.6 
                  }}>
                    +${tip.value.toFixed(2)}
                  </div>
                )}
                {!isCustom && selectedTip === tip.value && (
                  <div className="select-badge" style={{ opacity: 1, transform: 'none' }} onClick={(e) => { e.stopPropagation(); handleContinue(); }}>
                    Select <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="M12 1L17 6L12 11M1 6H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
              </div>
            </div>
          ))}

          <div 
            className={`crypto-card ${isCustom ? 'selected' : ''}`}
            onClick={handleSelectCustom}
          >
            <div className="crypto-name" style={{ fontSize: '22px', fontWeight: '700' }}>Custom</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isCustom ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontSize: '18px', fontWeight: '600' }}>$</span>
                  <input 
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={formatDisplay(customTipCents)}
                    onChange={handleCustomInputChange}
                    style={{
                      width: '100px',
                      padding: '4px 0',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '2px solid rgba(255,255,255,0.5)',
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: '600',
                      textAlign: 'center',
                      outline: 'none'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', margin: '32px 0 16px 0' }}>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', letterSpacing: '1px', marginBottom: '4px' }}>TOTAL TO PAY</div>
          <div style={{ fontSize: '42px', fontWeight: '800' }}>
            ${totalAmount.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="continue-button-container">
        <button 
          className="continue-button" 
          onClick={handleContinue}
          disabled={selectedTip === null && !isCustom}
        >
          Continue
        </button>
      </div>
    </>
  );
};

export default TipPage;
