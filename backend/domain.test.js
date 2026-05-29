const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildBotReplyText,
  categorizeMessage,
  extractEnquiry,
  extractText,
  getBotIntent,
  normalizeProduct,
  normalizeSalesItem,
  parseQuantity,
} = require('./server');

test('categorizes common WhatsApp sales intents', () => {
  assert.equal(categorizeMessage('Please send quotation and price'), 'Quotation Required');
  assert.equal(categorizeMessage('Payment UTR shared'), 'Payment Follow-up');
  assert.equal(categorizeMessage('Dispatch tracking chahiye'), 'Dispatch Query');
  assert.equal(categorizeMessage('Wrong item issue'), 'Complaint');
});

test('extracts product enquiry fields from inbound text', () => {
  const enquiry = extractEnquiry('Need quotation for round bar grade EN8 size 20mm qty 25 pcs');
  assert.equal(enquiry.grade, 'EN8');
  assert.equal(enquiry.size, '20mm');
  assert.equal(enquiry.shape, 'round bar');
  assert.equal(enquiry.quantity, '25 pcs');
});

test('normalizes invalid numeric inputs safely', () => {
  const product = normalizeProduct({ sku: 'A', name: 'Item', price: 'bad', stock_qty: 'NaN' });
  assert.equal(product.price, 0);
  assert.equal(product.stock_qty, 0);

  const item = normalizeSalesItem({ quantity: 'bad', rate: 'nope' });
  assert.equal(item.quantity, 1);
  assert.equal(item.rate, 0);
  assert.equal(item.amount, 0);
});

test('parses quantities and non-text WhatsApp messages', () => {
  assert.deepEqual(parseQuantity('12 kg'), { quantity: 12, unit: 'kg' });
  assert.equal(extractText({ type: 'image', image: { caption: 'Product photo', id: 'img-1' } }), 'Product photo');
  assert.equal(extractText({ type: 'document', document: { filename: 'invoice.pdf' } }), 'invoice.pdf');
});

test('builds policy-safe bot replies for greeting and order intent', () => {
  const settings = {
    companyName: 'BLUE OCEAN STEELS LLP',
    appName: 'BOS CRM',
    currency: 'INR',
    botGreeting: 'Hello, please share the product, size, and quantity you need.',
    handoffKeywords: ['urgent'],
  };
  const products = [{ sku: 'EN8-20', name: 'EN8 Round Bar', grade: 'EN8', size: '20mm', shape: 'round bar', unit: 'pcs', price: 120, stock_qty: 25 }];

  assert.equal(getBotIntent('hii'), 'greeting');
  assert.match(buildBotReplyText({ settings, text: 'hii', products }), /Welcome to BLUE OCEAN STEELS LLP/);
  assert.match(buildBotReplyText({ settings, text: 'book order for EN8 20mm qty 5', products }), /Order booking/);
  assert.equal(buildBotReplyText({ settings, text: 'STOP', products }), null);
});
