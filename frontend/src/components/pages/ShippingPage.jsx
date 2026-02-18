import React, { useState } from 'react';
import { ChevronIcon } from '../icons';
import { countries } from '../../constants';

const ShippingPage = ({ onBack, onContinue }) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    country: '',
    address1: '',
    address2: '',
    city: '',
    postalCode: ''
  });

  const refs = {
    firstName: React.useRef(null),
    lastName: React.useRef(null),
    address1: React.useRef(null),
    address2: React.useRef(null),
    city: React.useRef(null),
    postalCode: React.useRef(null)
  };

  const [errors, setErrors] = useState({});

  React.useEffect(() => {
    if (formData.country) {
      const error = validateField('postalCode', formData.postalCode, formData.country);
      setErrors(prev => ({ ...prev, postalCode: error }));
    }
  }, [formData.country]);

  const validateField = (name, value, country) => {
    if (name === 'postalCode' && country === 'United States') {
      const usZipRegex = /^\d{5}(-\d{4})?$/;
      if (value.trim() && !usZipRegex.test(value)) {
        return 'US Zip Code must be numeric (e.g., 12345)';
      }
    }
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => {
      const newFormData = { ...prev, [name]: value };
      
      // Validate
      const error = validateField(name, value, newFormData.country);
      setErrors(prevErrors => ({ ...prevErrors, [name]: error }));
      
      return newFormData;
    });

    // For smart jump logic, we need the current value from the event
    const prevValue = formData[name];
    if (value.length - prevValue.length > 2) {
      const sequence = ['firstName', 'lastName', 'address1', 'address2', 'city', 'postalCode'];
      const currentIndex = sequence.indexOf(name);
      
      for (let i = currentIndex + 1; i < sequence.length; i++) {
        const nextFieldName = sequence[i];
        if (!formData[nextFieldName]) {
          setTimeout(() => {
            refs[nextFieldName]?.current?.focus();
          }, 100);
          break;
        }
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isFormValid) onContinue(formData);
  };

  const isFormValid = 
    formData.firstName.trim() !== '' &&
    formData.lastName.trim() !== '' &&
    formData.country !== '' &&
    formData.address1.trim() !== '' &&
    formData.city.trim() !== '' &&
    formData.postalCode.trim() !== '';

  return (
    <form className="form-container" onSubmit={handleSubmit} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="view-header">
        <button className="back-button" type="button" onClick={onBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 style={{ margin: 0 }}>Shipping address</h2>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '20px' }}>
        <div className="row-group">
          <div className="input-group">
            <label htmlFor="firstName">First name</label>
            <input 
              id="firstName"
              name="firstName"
              ref={refs.firstName}
              className="input-field" 
              type="text" 
              placeholder="John" 
              autoComplete="given-name" 
              autoCapitalize="words"
              spellCheck="false"
              enterKeyHint="next"
              value={formData.firstName}
              onChange={handleChange}
            />
          </div>
          <div className="input-group">
            <label htmlFor="lastName">Last name</label>
            <input 
              id="lastName"
              name="lastName"
              ref={refs.lastName}
              className="input-field" 
              type="text" 
              placeholder="Doe" 
              autoComplete="family-name" 
              autoCapitalize="words"
              spellCheck="false"
              enterKeyHint="next"
              value={formData.lastName}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="input-group" style={{ marginTop: '16px' }}>
          <label htmlFor="country">Country</label>
          <div className="select-wrapper">
            <select 
              id="country"
              name="country"
              className="input-field" 
              autoComplete="country-name"
              value={formData.country}
              onChange={handleChange}
            >
              <option value="" disabled>Select country</option>
              <option value="United States">United States</option>
              <option value="United Kingdom">United Kingdom</option>
              <option disabled>─────</option>
              {countries.filter(c => c !== 'United States' && c !== 'United Kingdom').map(c => (
                <option key={`country-${c}`} value={c}>{c}</option>
              ))}
            </select>
            <div className="chevron"><ChevronIcon /></div>
          </div>
        </div>

        <div className="input-group" style={{ marginTop: '16px' }}>
          <label htmlFor="address1">Address line 1</label>
          <input 
            id="address1"
            name="address1"
            ref={refs.address1}
            className="input-field" 
            type="text" 
            placeholder="Street address" 
            autoComplete="address-line1" 
            autoCapitalize="words"
            spellCheck="false"
            enterKeyHint="next"
            value={formData.address1}
            onChange={handleChange}
          />
        </div>

        <div className="input-group" style={{ marginTop: '16px' }}>
          <label htmlFor="address2">Address line 2 (optional)</label>
          <input 
            id="address2"
            name="address2"
            ref={refs.address2}
            className="input-field" 
            type="text" 
            placeholder="Apt, suite, etc." 
            autoComplete="address-line2" 
            autoCapitalize="words"
            spellCheck="false"
            enterKeyHint="next"
            value={formData.address2}
            onChange={handleChange}
          />
        </div>

        <div className="row-group" style={{ marginTop: '16px' }}>
          <div className="input-group">
            <label htmlFor="city">City</label>
            <input 
              id="city"
              name="city"
              ref={refs.city}
              className="input-field" 
              type="text" 
              placeholder="City" 
              autoComplete="address-level2" 
              autoCapitalize="words"
              spellCheck="false"
              enterKeyHint="next"
              value={formData.city}
              onChange={handleChange}
            />
          </div>
          <div className="input-group">
            <label htmlFor="postalCode">Postal code</label>
            <input 
              id="postalCode"
              name="postalCode"
              ref={refs.postalCode}
              className={`input-field ${errors.postalCode ? 'input-error' : ''}`}
              type="text" 
              placeholder="12345" 
              autoComplete="postal-code" 
              autoCapitalize="characters"
              spellCheck="false"
              enterKeyHint="done"
              value={formData.postalCode}
              onChange={handleChange}
            />
            {errors.postalCode && <div className="error-message" style={{ color: '#FF4444', fontSize: '12px', marginTop: '4px' }}>{errors.postalCode}</div>}
          </div>
        </div>
      </div>

      <div className="continue-button-container" style={{ marginTop: 'auto', paddingTop: '20px' }}>
        <button 
          type="submit"
          className="continue-button" 
          disabled={!isFormValid || Object.values(errors).some(e => !!e)}
        >
          Continue
        </button>
      </div>
    </form>
  );
};

export default ShippingPage;
