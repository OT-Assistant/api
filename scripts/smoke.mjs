import { URL } from 'url';

const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8787';
const healthUrl = new URL('/health', apiBaseUrl).toString();

console.log(`Checking API health status at: ${healthUrl}`);

try {
  const response = await fetch(healthUrl);
  console.log(`Response Status: ${response.status} ${response.statusText}`);
  
  if (!response.ok) {
    throw new Error(`Smoke test failed! HTTP status: ${response.status}`);
  }
  
  const data = await response.json();
  console.log('Response Body:', JSON.stringify(data, null, 2));
  
  if (data.status === 'ok') {
    console.log('Smoke test passed successfully!');
    process.exit(0);
  } else {
    throw new Error(`Smoke test failed! Status check failed: expected "ok", got "${data.status}"`);
  }
} catch (error) {
  console.error('Smoke test failed with error:', error.message);
  process.exit(1);
}
