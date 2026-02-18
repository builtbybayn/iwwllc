import { iconMap } from './constants';

export const normalizeNetwork = (n) => {
  if (!n) return '';
  const name = n.toUpperCase();
  // Standardize to OxaPay / Asset standard codes
  if (name.includes('BITCOIN') || name === 'BTC') return 'BTC';
  if (name.includes('ETHEREUM') || name.includes('ERC20') || name === 'ETH') return 'ERC20';
  if (name.includes('TRON') || name.includes('TRC20') || name === 'TRX') return 'TRC20';
  if (name.includes('BSC') || name.includes('BEP20') || name.includes('BINANCE')) return 'BSC';
  if (name.includes('SOLANA') || name === 'SOL') return 'SOLANA';
  if (name.includes('TON') || name.includes('THE OPEN NETWORK')) return 'TON';
  if (name.includes('POLYGON') || name === 'MATIC' || name === 'POL') return 'POLYGON';
  if (name.includes('BASE')) return 'BASE';
  return name;
};

export const getIcon = (symbol, networkName) => {
  const s = symbol?.toUpperCase();
  const n = normalizeNetwork(networkName);
  const pairKey = `${s}-${n}`;
  return iconMap[pairKey] || iconMap[n] || iconMap[s] || null;
};

export const getAuthHeaders = () => {
  const initData = window.Telegram?.WebApp?.initData || '';
  return {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': initData
  };
};
