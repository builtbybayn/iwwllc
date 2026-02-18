import React, { useState, useEffect } from 'react';
import { CryptoIcon, ChevronIcon } from '../icons';
import { getIcon, getAuthHeaders } from '../../utils';
import { BACKEND_URL, iconMap } from '../../constants';

// We need to import the specific icons used in fallbackCoins as they are now in constants
import { 
  iconMap as icons // just for reference if needed, but we already have them via iconMap export
} from '../../constants';

const SelectCryptoPage = ({ onBack, onSelect }) => {
  const [expanded, setExpanded] = useState(null);
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [coins, setCoins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCurrencies = async () => {
      const allowedSymbols = ['BTC', 'ETH', 'SOL', 'USDC', 'USDT', 'LTC', 'BNB', 'TON', 'XMR', 'BCH', 'TRX', 'DOGE', 'POL', 'MATIC', 'XRP'];
      
      const fallbackCoins = [
        {
          id: 'btc-bitcoin', name: 'Bitcoin', symbol: 'BTC', icon: iconMap['BTC'],
          networks: [{ id: 'btc-bitcoin', name: 'Bitcoin', network: 'BTC', icon: iconMap['BTC'] }]
        },
        {
          id: 'eth-ethereum', name: 'Ethereum', symbol: 'ETH', icon: iconMap['ETH'],
          networks: [{ id: 'eth-ethereum', name: 'Ethereum', network: 'ETH', icon: iconMap['ETH'] }]
        },
        {
          id: 'sol-solana', name: 'Solana', symbol: 'SOL', icon: iconMap['SOL'],
          networks: [{ id: 'sol-solana', name: 'Solana', network: 'SOLANA', icon: iconMap['SOL'] }]
        },
        {
          id: 'usdt', name: 'USDT', symbol: 'USDT', icon: iconMap['USDT'],
          networks: [
            { id: 'usdt-erc20', name: 'USDT on Ethereum', network: 'ERC20', icon: iconMap['USDT-ERC20'] },
            { id: 'usdt-solana', name: 'USDT on Solana', network: 'SOLANA', icon: iconMap['USDT-SOLANA'] },
            { id: 'usdt-ton', name: 'USDT on TON', network: 'TON', icon: iconMap['USDT-TON'] },
            { id: 'usdt-trc20', name: 'USDT on Tron', network: 'TRC20', icon: iconMap['USDT-TRC20'] }
          ]
        },
        {
          id: 'usdc', name: 'USDC', symbol: 'USDC', icon: iconMap['USDC'],
          networks: [
            { id: 'usdc-erc20', name: 'USDC on Ethereum', network: 'ERC20', icon: iconMap['USDC-ERC20'] },
            { id: 'usdc-solana', name: 'USDC on Solana', network: 'SOLANA', icon: iconMap['USDC-SOLANA'] }
          ]
        }
      ];

      try {
        const response = await fetch(`${BACKEND_URL}/v1/payments/currencies`, {
          headers: getAuthHeaders()
        });
        const data = await response.json();
        
        if (data.status === 'ok' && data.currencies) {
          const grouped = {};
          
          Object.entries(data.currencies).forEach(([id, info]) => {
            const symbol = info.symbol.toUpperCase();
            if (!allowedSymbols.includes(symbol)) return;

            if (!grouped[symbol]) {
              grouped[symbol] = {
                id: symbol.toLowerCase(),
                name: info.name,
                symbol: symbol,
                icon: getIcon(symbol, null),
                networks: []
              };
            }

            const addNetwork = (netName) => {
              const netId = `${symbol.toLowerCase()}-${netName.toLowerCase()}`;
              if (grouped[symbol].networks.some(n => n.id === netId)) return;
              
              grouped[symbol].networks.push({
                id: netId,
                name: `${symbol} on ${netName}`,
                network: netName,
                icon: getIcon(symbol, netName) || info.icon
              });
            }

            if (Array.isArray(info.networks)) {
              info.networks.forEach(net => {
                const name = typeof net === 'string' ? net : (net.network || net.name);
                if (name) addNetwork(name);
              });
            } else if (info.networks && typeof info.networks === 'object') {
              Object.keys(info.networks).forEach(name => addNetwork(name));
            } else if (info.network) {
              addNetwork(info.network);
            }
          });

          const sorted = Object.values(grouped).sort((a, b) => {
            const priority = ['BTC', 'ETH', 'USDT', 'USDC', 'SOL'];
            const aIdx = priority.indexOf(a.symbol);
            const bIdx = priority.indexOf(b.symbol);
            
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.name.localeCompare(b.name);
          });
          
          if (sorted.length > 0) {
            setCoins(sorted);
            return;
          }
        }
        
        setCoins(fallbackCoins);

      } catch (err) {
        console.error('Failed to fetch currencies, using fallback', err);
        setCoins(fallbackCoins);
      } finally {
        setLoading(false);
      }
    };

    fetchCurrencies();
  }, []);

  const handleCoinClick = (coin) => {
    if (coin.networks.length === 1) {
      const netId = coin.networks[0].id;
      if (selectedCoin === netId) {
        onSelect(netId);
      } else {
        setSelectedCoin(netId);
      }
      setExpanded(null);
    } else {
      setExpanded(expanded === coin.id ? null : coin.id);
    }
  };

  const handleNetworkClick = (network) => {
    setSelectedCoin(network.id);
  };

  if (loading) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <>
      <div className="view-header" style={{ marginBottom: '12px' }}>
        <button className="back-button" onClick={onBack}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 style={{ margin: 0 }}>Select Crypto</h2>
      </div>

      <div className="crypto-list" style={{ paddingTop: '8px' }}>
        {coins.map(coin => (
          <div key={coin.id}>
            {coin.networks.length === 1 ? (
              <div 
                className={`crypto-card ${selectedCoin === coin.networks[0].id ? 'selected' : ''}`}
                onClick={() => handleCoinClick(coin)}
              >
                <CryptoIcon src={coin.icon} size={40} />
                <div className="crypto-name">{coin.name}</div>
                {selectedCoin === coin.networks[0].id && (
                  <div className="select-badge" style={{ opacity: 1, transform: 'none' }} onClick={(e) => { e.stopPropagation(); onSelect(coin.networks[0].id); }}>
                    Select <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="M12 1L17 6L12 11M1 6H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </div>
                )}
              </div>
            ) : (
              <div className={`crypto-accordion ${expanded === coin.id ? 'expanded' : ''} ${coin.networks.some(n => n.id === selectedCoin) ? 'selected-parent' : ''}`}>
                <div className="accordion-header" onClick={() => handleCoinClick(coin)}>
                  <CryptoIcon src={coin.icon} size={40} />
                  <div className="crypto-name">{coin.name}</div>
                  <div className="chevron-icon"><ChevronIcon /></div>
                </div>
                <div className="accordion-content">
                  <div className="accordion-content-inner">
                    <div className="chain-options">
                      {coin.networks.map(network => (
                        <div 
                          key={network.id} 
                          className="chain-row"
                          onClick={() => handleNetworkClick(network)}
                        >
                          <CryptoIcon src={network.icon} size={28} />
                          <div className="chain-name" style={{ fontSize: '17px' }}>{network.name}</div>
                          {selectedCoin === network.id && (
                            <div className="select-badge" style={{ opacity: 1, transform: 'none', padding: '6px 12px' }} onClick={(e) => { e.stopPropagation(); onSelect(network.id); }}>
                              Select <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><path d="M12 1L17 6L12 11M1 6H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="continue-button-container">
        <button 
          className="continue-button" 
          disabled={!selectedCoin}
          onClick={() => onSelect(selectedCoin)}
        >
          Continue
        </button>
      </div>
    </>
  );
};

export default SelectCryptoPage;
