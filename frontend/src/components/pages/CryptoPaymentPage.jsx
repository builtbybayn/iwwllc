import React, { useState, useEffect } from 'react';
import { CheckIcon, CopyIcon } from '../icons';
import { normalizeNetwork, getIcon, getAuthHeaders } from '../../utils';
import { BACKEND_URL, currencyThemeMap } from '../../constants';

const CryptoPaymentPage = ({ onBack, orderId, selection, onSuccess, onTimeout }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let pollInterval;
    let timerInterval;

    const initPayment = async () => {
      if (!orderId || !selection) return;
      
      setLoading(true);
      setError(null);

      try {
        const parts = selection.split('-');
        const currency = parts[0].toUpperCase();
        const rawNetwork = parts.slice(1).join('-').toUpperCase();
        const network = normalizeNetwork(rawNetwork);

        const response = await fetch(`${BACKEND_URL}/v1/orders/${orderId}/payments/oxapay`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ currency, network })
        });

        const data = await response.json();

        if (data.status === 'ok') {
          setPaymentData(data);
          setLoading(false);
          
          if (data.expiredAt) {
            const updateTimer = () => {
              const now = Math.floor(Date.now() / 1000);
              const remaining = data.expiredAt - now;
              if (remaining <= 0) {
                setTimeLeft(0);
                clearInterval(timerInterval);
                onTimeout();
              } else {
                setTimeLeft(remaining);
              }
            };
            updateTimer();
            timerInterval = setInterval(updateTimer, 1000);
          }

          pollInterval = setInterval(async () => {
            try {
              const pollRes = await fetch(`${BACKEND_URL}/v1/orders/${orderId}`, {
                headers: getAuthHeaders()
              });
              const pollData = await pollRes.json();
              if (pollData.status === 'paid') {
                clearInterval(pollInterval);
                if (timerInterval) clearInterval(timerInterval);
                onSuccess();
              } else if (pollData.status === 'expired') {
                clearInterval(pollInterval);
                if (timerInterval) clearInterval(timerInterval);
                onTimeout();
              }
            } catch (e) {
              console.error('Polling failed', e);
            }
          }, 3000);
        } else {
          setError(data.message || 'Failed to initialize payment');
          setLoading(false);
        }
      } catch (err) {
        console.error('[JARVIS] Payment Init Error:', err);
        setError('Connection error. Please try again.');
        setLoading(false);
      }
    };

    initPayment();
    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [orderId, selection]);

  const formatTime = (seconds) => {
    if (seconds <= 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCopyAddress = () => {
    if (!paymentData?.address) return;
    navigator.clipboard.writeText(paymentData.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
  };

  const handleCopyAmount = () => {
    if (!paymentData?.payAmount) return;
    navigator.clipboard.writeText(paymentData.payAmount.toString());
    setCopiedAmount(true);
    setTimeout(() => setCopiedAmount(false), 2000);
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
  };

  if (loading) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loader"></div>
        <div style={{ marginTop: 24, color: 'var(--color-text-secondary)', fontWeight: 500 }}>Preparing secure gateway...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h3 style={{ marginTop: 24 }}>Something went wrong</h3>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 32, padding: '0 20px', lineHeight: 1.5 }}>{error}</p>
        <button className="continue-button" onClick={onBack}>Go Back</button>
      </div>
    );
  }

  const { address, payAmount, payCurrency, qrcode, payLink, networkName } = paymentData;
  const parts = selection.split('-');
  const currencySymbol = parts[0].toUpperCase();
  
  const rawNetworkFromSelection = parts.slice(1).join(' ').toUpperCase();
  const confirmedNetwork = networkName || rawNetworkFromSelection;
  
  const paymentIcon = getIcon(currencySymbol, confirmedNetwork);
  const baseTheme = currencyThemeMap[currencySymbol] || { name: payCurrency || currencySymbol, color: 'var(--color-primary)' };
  
  let displayName = baseTheme.name;
  
  if (confirmedNetwork) {
    const cleanNet = confirmedNetwork.replace(/ Network$/i, '').toUpperCase();
    const cleanBaseName = baseTheme.name.toUpperCase();
    const cleanSymbol = currencySymbol.toUpperCase();

    if (cleanNet !== cleanBaseName && cleanNet !== cleanSymbol && cleanNet !== 'BITCOIN' && cleanNet !== 'ETHEREUM') {
      displayName = `${baseTheme.name} on ${confirmedNetwork.replace(/ Network$/i, '')}`;
    }
  }

  return (
    <>
      <div className="view-header" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="back-button" onClick={onBack}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '700' }}>{baseTheme.name}</h2>
        </div>
        
        {timeLeft !== null && (
          <div className="timer-box">
            <span className="timer-label">Send by:</span>
            <span className={`timer-value ${timeLeft < 300 ? 'urgent' : ''}`}>{formatTime(timeLeft)}</span>
          </div>
        )}
      </div>

      <div className="payment-info">
        {address ? (
          <>
            <div className="payment-card-premium">
              <div className="payment-title-text">
                Send <b 
                  onClick={handleCopyAmount} 
                  style={{ 
                    cursor: 'pointer', 
                    color: copiedAmount ? 'var(--color-primary)' : '#fff',
                    transition: 'color 0.2s'
                  }}
                >{payAmount}</b> <span style={{ color: baseTheme.color, fontWeight: 700 }}>{displayName}</span> to this address:
              </div>
              <div className="address-copy-container" onClick={handleCopyAddress}>
                <div className="address-text" style={{ 
                  fontSize: '13px', 
                  color: copied ? '#fff' : 'var(--color-text-secondary)',
                  transition: 'color 0.2s'
                }}>{address}</div>
                <div style={{ color: copied ? 'var(--color-primary)' : 'rgba(255, 255, 255, 0.4)', transition: 'color 0.2s' }}>
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </div>
              </div>
            </div>

            <div className="view-details-toggle" style={{ color: 'var(--color-primary)' }} onClick={() => setShowDetails(!showDetails)}>
              View Details <svg width="12" height="8" viewBox="0 0 12 8" fill="none" style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>

            {showDetails && (
              <div className="view-details-content">
                Send exactly the amount listed to the address below. Your order will be processed automatically. Send within the time limit or else the funds will be lost.
              </div>
            )}

            <div className="qr-section-premium">
              <div className="qr-frame">
                <img 
                  src={qrcode || `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${address}`} 
                  alt="QR Code"
                  style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }}
                />
              </div>
              <div className="qr-subtext">Scan the QR, or tap to copy the address</div>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 24 }}>🔗</div>
            <h3>Complete your payment</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 32 }}>
              Your payment address is ready. Please click the button below to complete the payment in our secure gateway.
            </p>
            <button 
              className="continue-button" 
              onClick={() => window.Telegram.WebApp.openLink(payLink)}
            >
              Open Payment Page
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default CryptoPaymentPage;
