import React, { useEffect, useState } from 'react'
import { MonochromeIcon } from './components/icons'
import { 
  usdcMono, 
  btcMono, 
  cardIcon, 
  applePayIcon, 
  BACKEND_URL 
} from './constants'
import { getAuthHeaders, triggerHaptic } from './utils'
import pfpLogo from './assets/icons/pfp-2026.png'

// Pages
import SuccessPage from './components/pages/SuccessPage'
import TimeoutPage from './components/pages/TimeoutPage'
import SelectCryptoPage from './components/pages/SelectCryptoPage'
import CryptoPaymentPage from './components/pages/CryptoPaymentPage'
import ContactInfoPage from './components/pages/ContactInfoPage'
import TipPage from './components/pages/TipPage'

const App = () => {
  const [view, setView] = useState('landing') // 'landing', 'payment', 'select-crypto', 'contact', 'tip', 'crypto-payment', 'success', 'timeout'
  const [selectedMethod, setSelectedMethod] = useState('crypto')
  const [selectedCrypto, setSelectedCrypto] = useState(null)
  const [orderId, setOrderId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [jobLoading, setJobLoading] = useState(true)
  const [jobError, setJobError] = useState(null)
  const [job, setJob] = useState(null)
  const [contact, setContact] = useState({ email: '', phone: '' })
  const [tip, setTip] = useState(0)

  const handleViewChange = (newView) => {
    triggerHaptic('light');
    setView(newView);
  };

  const handleMethodSelect = (method) => {
    triggerHaptic('selection');
    setSelectedMethod(method);
  };

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      tg.setHeaderColor('#000000')
      tg.setBackgroundColor('#000000')
    }

    // Fetch Job if jobId is in URL
    const urlParams = new URLSearchParams(window.location.search)
    const jobId = urlParams.get('jobId')
    if (jobId) {
      if (jobId === 'test') {
        setJob({
          id: 'test',
          amount: 125.00,
          description: 'Full Exterior Window Cleaning - Island Window Wizards LLC'
        });
        setJobLoading(false);
        return;
      }
      
      setJobLoading(true);
      fetch(`${BACKEND_URL}/v1/jobs/${jobId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'ok') {
            setJob(data.job);
          } else {
            setJobError(data.message || 'Job not found');
          }
        })
        .catch(err => {
          console.error('Failed to fetch job', err);
          setJobError('Failed to load job details');
        })
        .finally(() => setJobLoading(false));
    } else {
      setJobLoading(false);
      setJobError('No job ID provided');
    }
  }, [])

  const handleStartCheckout = async (finalTip = tip) => {
    triggerHaptic('rigid');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/orders`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ 
          contact, 
          paymentMethod: selectedMethod, 
          jobId: job?.id, 
          tipAmount: finalTip 
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setOrderId(data.orderId);
        if (selectedMethod === 'crypto') {
          setView('crypto-payment');
        } else {
          const stripeBaseUrl = import.meta.env.VITE_STRIPE_URL || 'https://buy.stripe.com/your_default_link';
          const stripeUrl = `${stripeBaseUrl}?client_reference_id=${data.orderId}&prefilled_email=${encodeURIComponent(contact.email)}`;
          window.location.href = stripeUrl;
        }
      } else {
        alert(data.message || 'Failed to create order');
      }
    } catch (err) {
      alert('Network error');
    } finally {
      setLoading(false);
    }
  };

  const PageLayout = ({ children, className = '', style = {} }) => (
    <div className={`app-container ${className}`} style={style}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <div className="secure-footer">
        Secure checkout powered by Oxapay & Stripe
      </div>
    </div>
  );

  const renderView = () => {
    if (view === 'success') return (
      <PageLayout className="success-view">
        <SuccessPage />
      </PageLayout>
    );
    if (view === 'timeout') return (
      <PageLayout className="success-view">
        <TimeoutPage onBack={() => handleViewChange('payment')} />
      </PageLayout>
    );

    if (view === 'landing') {
      return (
        <PageLayout>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ 
              width: '100px', 
              height: '100px', 
              borderRadius: '50%', 
              overflow: 'hidden', 
              margin: '0 auto 20px auto',
              background: '#000',
              border: '3px solid #6D5081'
            }}>
              <img src={pfpLogo} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Island Window Wizards" />
            </div>
            <h1 style={{ fontSize: '28px', margin: 0 }}>Job Payment</h1>
          </div>

          {job ? (
            <div className="payment-card-premium fade-in-up-subtle" style={{ marginBottom: '32px', padding: '20px 24px' }}>
              <div style={{ color: 'var(--color-text-secondary)', fontWeight: '400', fontSize: '14px', marginBottom: '4px' }}>Description</div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', lineHeight: '1.4' }}>{job.description}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontWeight: '400', fontSize: '14px', marginBottom: '4px' }}>Amount Due</div>
              <div style={{ fontSize: '32px', fontWeight: '800' }}>${job.amount.toFixed(2)}</div>
            </div>
          ) : jobLoading ? (
            <div style={{ textAlign: 'center', padding: '20px' }}>
              <div className="loader" style={{ margin: '0 auto' }}></div>
              <p style={{ marginTop: '16px', opacity: 0.6 }}>Loading job details...</p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', backgroundColor: 'rgba(255, 77, 77, 0.1)', borderRadius: '16px', marginBottom: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#ff4d4d' }}>{jobError || 'Job not found'}</div>
              <p style={{ marginTop: '8px', opacity: 0.6, fontSize: '14px' }}>Please contact us if you believe this is an error.</p>
            </div>
          )}

          <div className="continue-button-container">
            <button className="continue-button" onClick={() => handleViewChange('payment')} disabled={!job}>
              Continue
            </button>
          </div>
        </PageLayout>
      );
    }

    if (view === 'contact') {
      return (
        <PageLayout>
          <ContactInfoPage 
            onBack={() => handleViewChange('payment')} 
            onContinue={(info) => { setContact(info); handleViewChange('tip'); }} 
          />
        </PageLayout>
      );
    }

    if (view === 'tip') {
      return (
        <PageLayout>
          <TipPage 
            onBack={() => handleViewChange('contact')} 
            onContinue={(tipVal) => { 
              setTip(tipVal); 
              if (selectedMethod === 'crypto') {
                handleViewChange('select-crypto');
              } else {
                handleStartCheckout(tipVal);
              }
            }} 
            baseAmount={job?.amount || 0} 
          />
        </PageLayout>
      );
    }

    if (view === 'select-crypto') {
      return (
        <PageLayout>
          <SelectCryptoPage 
            onBack={() => handleViewChange('tip')} 
            onSelect={(id) => { setSelectedCrypto(id); handleStartCheckout(tip); }} 
          />
        </PageLayout>
      )
    }

    if (view === 'crypto-payment') {
      return (
        <PageLayout>
          <CryptoPaymentPage 
            orderId={orderId} 
            selection={selectedCrypto} 
            onSuccess={() => handleViewChange('success')} 
            onTimeout={() => handleViewChange('timeout')}
            onBack={() => handleViewChange('tip')} 
          />
        </PageLayout>
      );
    }

    // Default: Payment Method selection view
    return (
      <PageLayout>
        <div className="view-header">
          <button className="back-button" onClick={() => handleViewChange('landing')}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 style={{ margin: 0 }}>Payment Method</h2>
        </div>

        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '24px' }}>
          Select how you would like to pay for your service.
        </p>

        <div className="payment-options">
          <div 
            className={`payment-card ${selectedMethod === 'crypto' ? 'selected' : ''}`}
            onClick={() => handleMethodSelect('crypto')}
          >
            <div className="card-title">Crypto (Save 10%)</div>
            <div className="card-subtitle">Fastest & Easiest</div>
            <div className="card-footer">
              <div className="icon-group">
                <div className="icon-circle" style={{ background: selectedMethod === 'crypto' ? 'white' : '#0088FF', color: selectedMethod === 'crypto' ? '#0088FF' : 'white' }}><MonochromeIcon src={usdcMono} size={24} /></div>
                <div className="icon-circle" style={{ background: selectedMethod === 'crypto' ? 'white' : '#0088FF', color: selectedMethod === 'crypto' ? '#0088FF' : 'white', marginLeft: -12 }}><MonochromeIcon src={btcMono} size={24} /></div>
                <span className="plus-text">+10</span>
              </div>
              <div className="select-badge" onClick={(e) => { e.stopPropagation(); handleViewChange('contact'); }}>Select <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="M12 1L17 6L12 11M1 6H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            </div>
          </div>

          <div 
            className={`payment-card ${selectedMethod === 'card' ? 'selected' : ''}`}
            onClick={() => handleMethodSelect('card')}
          >
            <div className="card-title">Credit / Debit Card</div>
            <div className="card-subtitle">Instant, secure checkout</div>
            <div className="card-footer">
              <div className="icon-group">
                <div className="icon-circle" style={{ background: selectedMethod === 'card' ? 'white' : '#0088FF', color: selectedMethod === 'card' ? '#0088FF' : 'white' }}><MonochromeIcon src={cardIcon} size={24} /></div>
                <div className="icon-circle" style={{ background: selectedMethod === 'card' ? 'white' : '#0088FF', color: selectedMethod === 'card' ? '#0088FF' : 'white', marginLeft: -12 }}><MonochromeIcon src={applePayIcon} size={24} /></div>
                <span className="plus-text">+2</span>
              </div>
              <div className="select-badge" onClick={(e) => { e.stopPropagation(); handleViewChange('contact'); }}>Select <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="M12 1L17 6L12 11M1 6H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
            </div>
          </div>
        </div>

        <div className="continue-button-container">
          <button className="continue-button" onClick={() => handleViewChange('contact')}>
            Continue
          </button>
        </div>
      </PageLayout>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--color-bg)' }}>
      <div className="brand-banner">
        Island Window Wizards LLC
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div key={view} className="view-transition-wrapper">
          {renderView()}
        </div>
      </div>
    </div>
  )
}

export default App
