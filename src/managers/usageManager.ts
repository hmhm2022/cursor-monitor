import * as os from 'os';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';
import axios from 'axios';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { UsageData, StripeProfile, Auth0UserInfo, ApiError } from '../types';

interface DbRow {
    value: string;
}

export class UsageManager {
    private readonly DB_KEYS = {
        access_token: 'cursorAuth/accessToken'
    };

    private getDbPath(): string {
        // 获取用户配置
        const config = vscode.workspace.getConfiguration('crazyCursor');
        const useCursorNightly = config.get<boolean>('useCursorNightly', false);
        
        const system = os.platform();
        const homedir = os.homedir();
        
        switch (system) {
            case 'win32':
                if (useCursorNightly) {
                    return path.join(process.env.APPDATA || '', 'Cursor Nightly', 'User', 'globalStorage', 'state.vscdb');
                }
                return path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
            case 'darwin':
                if (useCursorNightly) {
                    return path.join(homedir, 'Library', 'Application Support', 'Cursor Nightly', 'User', 'globalStorage', 'state.vscdb');
                }
                return path.join(homedir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
            case 'linux':
                if (useCursorNightly) {
                    return path.join(homedir, '.config', 'Cursor Nightly', 'User', 'globalStorage', 'state.vscdb');
                }
                return path.join(homedir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
            default:
                throw new Error(`不支持的操作系统: ${system}`);
        }
    }

    // 检查数据库文件是否存在
    async checkDbExists(): Promise<{ exists: boolean; path: string; isNightly: boolean }> {
        const config = vscode.workspace.getConfiguration('crazyCursor');
        const useCursorNightly = config.get<boolean>('useCursorNightly', false);
        const dbPath = this.getDbPath();
        
        const exists = fs.existsSync(dbPath);
        return { exists, path: dbPath, isNightly: useCursorNightly };
    }

    // 检查另一个版本的 Cursor 是否存在
    async checkAlternativeDbExists(): Promise<{ exists: boolean; path: string }> {
        // 临时切换配置以获取另一个版本的路径
        const config = vscode.workspace.getConfiguration('crazyCursor');
        const currentSetting = config.get<boolean>('useCursorNightly', false);
        
        // 根据系统获取另一个版本的路径
        const system = os.platform();
        const homedir = os.homedir();
        let alternativePath = '';
        
        switch (system) {
            case 'win32':
                alternativePath = currentSetting 
                    ? path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
                    : path.join(process.env.APPDATA || '', 'Cursor Nightly', 'User', 'globalStorage', 'state.vscdb');
                break;
            case 'darwin':
                alternativePath = currentSetting 
                    ? path.join(homedir, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
                    : path.join(homedir, 'Library', 'Application Support', 'Cursor Nightly', 'User', 'globalStorage', 'state.vscdb');
                break;
            case 'linux':
                alternativePath = currentSetting 
                    ? path.join(homedir, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb')
                    : path.join(homedir, '.config', 'Cursor Nightly', 'User', 'globalStorage', 'state.vscdb');
                break;
        }
        
        const exists = fs.existsSync(alternativePath);
        return { exists, path: alternativePath };
    }

    async getCurrentToken(): Promise<string | undefined> {
        const dbCheck = await this.checkDbExists();
        
        if (!dbCheck.exists) {
            const altDb = await this.checkAlternativeDbExists();
            const versionText = dbCheck.isNightly ? 'Cursor Nightly' : 'Cursor 正式版';
            const altVersionText = dbCheck.isNightly ? 'Cursor 正式版' : 'Cursor Nightly';
            
            if (altDb.exists) {
                // 如果另一个版本存在，提示用户切换
                const message = `未找到${versionText}，但检测到${altVersionText}已安装。是否切换？`;
                const result = await vscode.window.showWarningMessage(message, '切换', '取消');
                
                if (result === '切换') {
                    await vscode.workspace.getConfiguration('crazyCursor').update('useCursorNightly', !dbCheck.isNightly, true);
                    vscode.window.showInformationMessage(`已切换到${altVersionText}`);
                    return this.getCurrentToken(); // 递归调用，使用新配置
                }
            } else {
                // 两个版本都不存在
                vscode.window.showErrorMessage(`未找到 Cursor 数据库文件。请确保已安装 Cursor 或 Cursor Nightly。`);
            }
            
            return undefined;
        }

        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(dbCheck.path, (err) => {
                if (err) {
                    if (err.message && err.message.includes('SQLITE_CANTOPEN')) {
                        reject(new Error(`数据库文件不存在或无法访问: ${dbCheck.path}`));
                    } else {
                        reject(new Error(`连接数据库失败: ${err}`));
                    }
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