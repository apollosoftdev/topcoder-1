import chalk from 'chalk';
import { Cache } from '../utils/cache';

// [NOTE]: GitHub device flow response structure
interface DeviceCodeResponse {
  device_code: string;
  user_code: string; // [NOTE]: Code user enters on github.com/login/device
  verification_uri: string;
  expires_in: number;
  interval: number; // [NOTE]: Polling interval in seconds
}

// [NOTE]: Token response - check error field for auth status
interface TokenResponse {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

// [!IMPORTANT]: GitHub OAuth endpoints for device flow
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export class GitHubOAuth {
  private clientId: string;
  private cache: Cache;

  constructor(clientId: string, cache: Cache) {
    this.clientId = clientId;
    this.cache = cache;
  }

  // [!IMPORTANT]: Main entry point - checks cache first, then authenticates if needed
  async authenticate(): Promise<string> {
    const existingToken = this.cache.getToken();
    if (existingToken) {
      const isValid = await this.validateToken(existingToken);
      if (isValid) {
        console.log(chalk.green('Using existing GitHub token.'));
        return existingToken;
      } else {
        console.log(chalk.yellow('Existing token is invalid. Re-authenticating...'));
        this.cache.clearToken();
      }
    }

    return this.performDeviceFlow();
  }

  // [NOTE]: Validates token by calling GitHub user API
  private async validateToken(token: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // [!IMPORTANT]: Device flow - user authenticates in browser, CLI polls for token
  private async performDeviceFlow(): Promise<string> {
    console.log(chalk.cyan('\nStarting GitHub OAuth Device Flow...\n'));

    const deviceCode = await this.requestDeviceCode();

    // [NOTE]: Display instructions for user to authenticate
    console.log(chalk.yellow('━'.repeat(50)));
    console.log(chalk.bold('\nTo authenticate with GitHub:\n'));
    console.log(chalk.white(`  1. Open: ${chalk.cyan.underline(deviceCode.verification_uri)}`));
    console.log(chalk.white(`  2. Enter code: ${chalk.green.bold(deviceCode.user_code)}\n`));
    console.log(chalk.yellow('━'.repeat(50)));
    console.log(chalk.gray(`\nWaiting for authorization (expires in ${Math.floor(deviceCode.expires_in / 60)} minutes)...\n`));

    const token = await this.pollForToken(deviceCode);

    this.cache.setToken(token);
    console.log(chalk.green('\nSuccessfully authenticated with GitHub!\n'));

    return token;
  }

  // [NOTE]: Request device code from GitHub - first step of device flow
  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const response = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: this.clientId,
        scope: 'read:user repo read:org', // [!IMPORTANT]: Required scopes for full analysis
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get device code: ${response.status} ${text}`);
    }

    return response.json() as Promise<DeviceCodeResponse>;
  }

  // [!IMPORTANT]: Polls GitHub until user completes auth or timeout
  private async pollForToken(deviceCode: DeviceCodeResponse): Promise<string> {
    const startTime = Date.now();
    const expiresAt = startTime + deviceCode.expires_in * 1000;
    let interval = deviceCode.interval * 1000;

    while (Date.now() < expiresAt) {
      await this.sleep(interval);

      try {
        const response = await fetch(GITHUB_TOKEN_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: this.clientId,
            device_code: deviceCode.device_code,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        });

        const data = (await response.json()) as TokenResponse;

        if (data.access_token) {
          return data.access_token;
        }

        // [NOTE]: authorization_pending means user hasn't completed auth yet
        if (data.error === 'authorization_pending') {
          process.stdout.write(chalk.gray('.'));
          continue;
        }

        // [NOTE]: slow_down means we're polling too fast
        if (data.error === 'slow_down') {
          interval += 5000;
          continue;
        }

        if (data.error === 'expired_token') {
          throw new Error('Authorization request expired. Please try again.');
        }

        if (data.error === 'access_denied') {
          throw new Error('Authorization was denied by the user.');
        }

        if (data.error) {
          throw new Error(`OAuth error: ${data.error} - ${data.error_description}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('OAuth error')) {
          throw error;
        }
        console.log(chalk.yellow('\nNetwork error, retrying...'));
      }
    }

    throw new Error('Authorization request timed out. Please try again.');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// [!IMPORTANT]: Reads GitHub credentials from environment variables
export function getClientCredentials(): { clientId: string } {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (!clientId) {
    console.error(chalk.red('\nError: Missing GitHub OAuth credentials.'));
    console.error(chalk.yellow('\nPlease set the following environment variables:'));
    console.error(chalk.white('  GITHUB_CLIENT_ID=your_client_id'));
    console.error(chalk.gray('\nYou can create a GitHub OAuth App at:'));
    console.error(chalk.cyan('  https://github.com/settings/developers'));
    console.error(chalk.gray('\nMake sure to enable "Device Flow" in your OAuth App settings.\n'));
    process.exit(1);
  }

  return { clientId };
}
