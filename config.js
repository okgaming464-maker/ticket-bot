module.exports = {
  products: [
    {
      id: 'echo',
      name: 'Echo.lua Script',
      description: 'Da Hood cheat script with aim assist, silent aim, ESP, and more.',
      prices: {
        eth: '0.01',
        btc: '0.000035',
        ltc: '0.65',
        usdt: '20',
      },
    },
  ],

  paymentMethods: [
    {
      id: 'eth',
      label: 'Ethereum (ETH)',
      currency: 'ETH',
      address: '0xYourEthereumWalletAddressHere',
      network: 'Ethereum (ERC-20)',
    },
    {
      id: 'btc',
      label: 'Bitcoin (BTC)',
      currency: 'BTC',
      address: 'bc1qYourBitcoinAddressHere',
      network: 'Bitcoin',
    },
    {
      id: 'ltc',
      label: 'Litecoin (LTC)',
      currency: 'LTC',
      address: 'ltc1qYourLitecoinAddressHere',
      network: 'Litecoin',
    },
    {
      id: 'usdt',
      label: 'Tether (USDT)',
      currency: 'USDT',
      address: '0xYourUsdtErc20AddressHere',
      network: 'Ethereum (ERC-20)',
    },
  ],

  terms:
    '**Terms & Conditions**\n\n' +
    '• All sales are final — no refunds.\n' +
    '• No whitelist transfers or re-whitelisting.\n' +
    '• By purchasing, you agree to these terms.',

  embedColors: {
    info: 0x00aaff,
    success: 0x00ff88,
    warning: 0xffaa00,
    danger: 0xff4444,
  },
};
