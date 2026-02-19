import btcMono from './assets/icons/btc.svg'
import usdcMono from './assets/icons/usdc.svg'
import btcIcon from './assets/icons/bitcoin.svg'
import usdcIcon from './assets/icons/usdcoin.svg'
import usdtIcon from './assets/icons/usdt.svg'
import solIcon from './assets/icons/sol.svg'
import ethIcon from './assets/icons/eth.svg'
import bchIcon from './assets/icons/bch.svg'
import bnbIcon from './assets/icons/bnb.svg'
import dogeIcon from './assets/icons/doge.svg'
import ltcIcon from './assets/icons/ltc.svg'
import tonIcon from './assets/icons/ton.svg'
import trxIcon from './assets/icons/trx.svg'
import xmrIcon from './assets/icons/xmr.svg'
import xrpIcon from './assets/icons/xrp.svg'
import polyIcon from './assets/icons/polygon.svg'
import bscIcon from './assets/icons/bsc.svg'
import baseIcon from './assets/icons/base.svg'

// Pair Icons
import ethBaseIcon from './assets/icons/eth-on-base.svg'
import ethBscIcon from './assets/icons/eth-on-bsc.svg'
import usdcEthIcon from './assets/icons/usdc-on-eth.svg'
import usdcSolIcon from './assets/icons/usdc-on-sol.svg'
import usdcBaseIcon from './assets/icons/usdc-on-base.svg'
import usdcBscIcon from './assets/icons/usdc-on-bsc.svg'
import usdtEthIcon from './assets/icons/usdt-on-eth.svg'
import usdtSolIcon from './assets/icons/usdt-on-sol.svg'
import usdtBscIcon from './assets/icons/usdt-on-bsc.svg'
import usdtPolyIcon from './assets/icons/usdt-on-polygon.svg'
import usdtTonIcon from './assets/icons/usdt-on-ton.svg'
import usdtTrxIcon from './assets/icons/usdt-on-trx.svg'

import applePayIcon from './assets/icons/apple-pay.svg'
import cardIcon from './assets/icons/card-colored.svg'
import cartIcon from './assets/icons/cart.svg'

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export const PRODUCT_NAME = import.meta.env.VITE_PRODUCT_NAME || 'Premium Device';
export const PRODUCT_PRICE = import.meta.env.VITE_PRODUCT_PRICE || '399';

export const iconMap = {
  'BTC': btcIcon,
  'ETH': ethIcon,
  'SOL': solIcon,
  'USDC': usdcIcon,
  'USDT': usdtIcon,
  'BCH': bchIcon,
  'BNB': bnbIcon,
  'DOGE': dogeIcon,
  'LTC': ltcIcon,
  'TON': tonIcon,
  'TRX': trxIcon,
  'XMR': xmrIcon,
  'XRP': xrpIcon,
  'POL': polyIcon,
  'POLYGON': polyIcon,
  'MATIC': polyIcon,
  'BSC': bscIcon,
  'BASE': baseIcon,
  // Explicit Pair Overrides
  'ETH-BASE': ethBaseIcon,
  'ETH-BSC': ethBscIcon,
  'USDC-ERC20': usdcEthIcon,
  'USDC-SOLANA': usdcSolIcon,
  'USDC-BASE': usdcBaseIcon,
  'USDC-BSC': usdcBscIcon,
  'USDT-ERC20': usdtEthIcon,
  'USDT-SOLANA': usdtSolIcon,
  'USDT-BSC': usdtBscIcon,
  'USDT-POLYGON': usdtPolyIcon,
  'USDT-TON': usdtTonIcon,
  'USDT-TRC20': usdtTrxIcon
};

export const currencyThemeMap = {
  'BTC': { name: 'Bitcoin', color: '#f7931a' },
  'USDT': { name: 'USDT', color: '#26a17b' },
  'ETH': { name: 'Ethereum', color: '#627eea' },
  'USDC': { name: 'USDC', color: '#3e73c4' },
  'SOL': { name: 'Solana', color: '#a364fc' },
  'BCH': { name: 'Bitcoin Cash', color: '#0ac18e' },
  'BNB': { name: 'BNB', color: '#f0b90b' },
  'DOGE': { name: 'Dogecoin', color: '#e2cc85' },
  'LTC': { name: 'Litecoin', color: '#345d9d' },
  'XMR': { name: 'Monero', color: '#f26822' },
  'POL': { name: 'Polygon', color: '#6c00f6' },
  'MATIC': { name: 'Polygon', color: '#6c00f6' },
  'XRP': { name: 'XRP', color: '#23292f' },
  'TON': { name: 'TON', color: '#0098ea' },
  'TRX': { name: 'TRX', color: '#ff060a' }
};

export {
  btcMono,
  usdcMono,
  applePayIcon,
  cardIcon,
  cartIcon
};
