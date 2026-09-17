const fs = require('fs');
let content = fs.readFileSync('app/src/app/features/masters/member-form.ts', 'utf8');

const target = "if (this.isNew()) {\n          await must(this.sb.from('customers').insert({ code: value.code, ...record }));\n        } else {";

const replacement = `if (this.isNew()) {
          const settings = await must(this.sb.from('company_settings').select('joining_fee').maybeSingle());
          record['joining_fee'] = settings?.joining_fee || 0;
          await must(this.sb.from('customers').insert({ code: value.code, ...record }));
        } else {`;

content = content.replace(target, replacement);
fs.writeFileSync('app/src/app/features/masters/member-form.ts', content);
