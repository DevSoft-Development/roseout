import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const event = process.env.EVENT_NAME;
const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA;
let mobile = true;
if (event !== 'workflow_dispatch' && base && head && !/^0{40}/.test(base)) {
  try {
    const paths = execFileSync('git', ['diff', '--name-only', base, head], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
    if (paths.length > 0) {
      const mobileImpact = /^(pos-mobile\/|mobile\/|azure-pipelines-pos-mobile\.yml|\.github\/workflows\/pos-mobile-ci\.yml|package(-lock)?\.json)/;
      mobile = paths.some((path) => mobileImpact.test(path));
      const recognized = /^(apps\/business\/app\/(locations\/dashboard\/online-ordering\/|api\/locations\/online-ordering\/|locations\/dashboard\/CanonicalLocationModuleNav\.tsx)|lib\/pos\/|app\/api\/(pos\/device\/|stripe\/connect\/webhook\/route\.ts)|apps\/consumer\/app\/api\/(pos\/device\/|stripe\/connect\/webhook\/route\.ts)|supabase\/migrations\/.*pos_device_command_queue\.sql|infra\/supabase\/operational-shards\/online-ordering-v8\.sql|scripts\/pos-(online-order-fulfillment|signature-plus)-regression\.mjs)/;
      if (paths.some((path) => !mobileImpact.test(path) && !recognized.test(path))) mobile = true;
    }
  } catch (error) {
    console.warn('Unable to classify POS changes; running mobile checks.', error.message);
    mobile = true;
  }
}
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'mobile=' + mobile + '\n');
console.log('POS mobile validation: ' + (mobile ? 'required' : 'skipped for backend-only changes'));
