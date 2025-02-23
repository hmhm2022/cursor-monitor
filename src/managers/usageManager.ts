import * as os from 'os';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';
import axios from 'axios';
import { UsageData, StripeProfile, Auth0UserInfo, ApiError } from '../types';

interface DbRow {
    value: string;
}

export class UsageManager {
    private readonly DB_KEYS = {
        access_token: 'cursorAuth/accessToken'
    };

    private getDbPath(): string {
        const system = os.platform();
        const homedir = os.homedir();
        
        switch (system) {
            case 'win32':
                return path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
            case 'darwin':
                return path.join(homedir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
            case 'linux':
                return path.join(homedir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
            default:
                throw new Error(`不支持的操作系统: ${system}`);
        }
    }

    async getCurrentToken(): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.getDbPath(), (err) => {
                if (err) {
                    reject(new Error(`连接数据库失败: ${err}`));
                    return;
                }

                db.get<DbRow>(
                    "SELECT value FROM itemTable WHERE key = ?",
                    [this.DB_KEYS.access_token],
                    (err, row: DbRow | undefined) => {
                        if (err) {
                            reject(new Error(`查询数据库失败: ${err}`));
                            return;
                        }

                        db.close((err) => {
                            if (err) {
                                reject(new Error(`关闭数据库失败: ${err}`));
                                return;
                            }
                            resolve(row?.value);
                        });
                    }
                );
            });
        });
    }

    private extractUserId(token: string): string {
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            const match = /auth0\|(.+)/.exec(payload.sub || '');
            return match ? match[1] : '';
        } catch {
            return '';
        }
    }

    private handleApiError(error: unknown, operation: string): never {
        const err = error as ApiError;
        const errorMessage = err.response
            ? `状态码: ${err.response.status}, 响应: ${JSON.stringify(err.response.data)}`
            : err.message || String(error);
        
        console.error(`${operation} 详细错误:`, errorMessage);
        throw new Error(`${operation}: ${errorMessage}`);
    }

    async getUsage(token: string): Promise<UsageData> {
        try {
            const userId = this.extractUserId(token);
            const cookieId = userId || "user_01OOOOOOOOOOOOOOOOOOOOOOOO";
            
            const response = await axios.get('https://www.cursor.com/api/usage', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
                    'Cookie': `WorkosCursorSessionToken=${cookieId}%3A%3A${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.data) {
                throw new Error('API 返回数据为空');
            }

            return {
                premium_usage: response.data['gpt-4']?.numRequestsTotal || 0,
                max_premium_usage: response.data['gpt-4']?.maxRequestUsage || 999,
                basic_usage: response.data['gpt-3.5-turbo']?.numRequestsTotal || 0,
                max_basic_usage: response.data['gpt-3.5-turbo']?.maxRequestUsage || 999
            };
        } catch (error) {
            this.handleApiError(error, '获取使用量失败');
        }
    }

    async getAuth0UserInfo(token: string): Promise<Auth0UserInfo> {
        try {
            const userId = this.extractUserId(token);
            const cookieId = userId || "user_01OOOOOOOOOOOOOOOOOOOOOOOO";
            
            const response = await axios.get('https://www.cursor.com/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
                    'Cookie': `WorkosCursorSessionToken=${cookieId}%3A%3A${token}`,
                    'Accept': 'application/json'
                }
            });

            if (!response.data) {
                throw new Error('API 返回数据为空');
            }

            return {
                email: response.data.email,
                email_verified: response.data.email_verified,
                name: response.data.name,
                sub: response.data.sub,
                updated_at: response.data.updated_at
            };
        } catch (error) {
            this.handleApiError(error, '获取用户信息失败');
        }
    }

    async getStripeProfile(token: string): Promise<StripeProfile> {
        try {
            const response = await axios.get('https://api2.cursor.sh/auth/full_stripe_profile', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.130 Safari/537.36',
                    'Accept': 'application/json'
                }
            });

            if (!response.data) {
                throw new Error('API 返回数据为空');
            }

            return {
                membershipType: response.data.membershipType,
                daysRemainingOnTrial: response.data.daysRemainingOnTrial
            };
        } catch (error) {
            this.handleApiError(error, '获取订阅信息失败');
        }
    }
} 