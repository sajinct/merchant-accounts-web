const fs = require('fs');
let content = fs.readFileSync('app/src/app/features/membership/member-subscription.spec.ts', 'utf8');

content = content.replace(
  'order: () => query,',
  `order: () => query,\n          maybeSingle: () => Promise.resolve({ data: table === 'customers' ? { joining_fee: 100 } : null, error: null }),`
);

fs.writeFileSync('app/src/app/features/membership/member-subscription.spec.ts', content);
