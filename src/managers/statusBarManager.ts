import * as vscode from 'vscode';
import { UsageManager } from './usageManager';

export class StatusBarManager implements vscode.Disposable {
    private _statusBarItem: vscode.StatusBarItem;
    private usageManager: UsageManager;

    constructor(usageManager: UsageManager) {
        this.usageManager = usageManager;
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );

        // 点击状态栏时显示菜单
        this._statusBarItem.command = 'crazy-cursor.showMenu';
    }

    init() {
        this._statusBarItem.text = "$(rocket) Cursor Monitor";
        this._statusBarItem.show();
    }

    // 添加时间格式化辅助函数
    private formatDateTime(isoString: string): string {
        try {
            const date = new Date(isoString);
            return date.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        } catch {
            return 'N/A';
        }
    }

    async showMenu() {
        try {
            // 获取最新数据
            const token = await this.usageManager.getCurrentToken();
            if (!token) {
                vscode.window.showWarningMessage('未找到有效的 token，请先更新 Token');
                return;
            }

            const [usage, accountInfo, subscriptionInfo] = await Promise.all([
                this.usageManager.getUsage(token),
                this.usageManager.getAuth0UserInfo(token),
                this.usageManager.getStripeProfile(token)
            ]);

            // 创建信息显示项
            const infoItems: vscode.QuickPickItem[] = [
                {
                    label: "=== 账户信息 ===",
                    kind: vscode.QuickPickItemKind.Separator,
                    description: ""
                },
                {
                    label: `邮箱：${accountInfo.email || 'N/A'}`
                },
                // {
                //     label: `验证状态：${accountInfo.email_verified || false}`
                // },
                {
                    label: `用户ID：${accountInfo.sub || 'N/A'}`
                },
                {
                    label: `用户名：${accountInfo.name || 'N/A'}`
                },
                {
                    label: `注册时间：${this.formatDateTime(accountInfo.updated_at || '')}`
                },
                {
                    label: "=== 订阅信息 ===",
                    kind: vscode.QuickPickItemKind.Separator
                },
                {
                    label: `账户类型：${subscriptionInfo.membershipType || 'free_trial'}`
                },
                {
                    label: `剩余天数：${subscriptionInfo.daysRemainingOnTrial || 0}`
                },
                {
                    label: "=== 剩余使用量 ===",
                    kind: vscode.QuickPickItemKind.Separator
                },
                {
                    label: `Premium 使用情况：${usage.premium_usage || 0}/${usage.max_premium_usage || 'None'}`
                },
                {
                    label: `Basic       使用情况：${usage.basic_usage || 0}/${usage.max_basic_usage || 'None'}`
                },
                {
                    label: "=== 操作 ===",
                    kind: vscode.QuickPickItemKind.Separator
                },
                {
                    label: "$(sync) 刷新使用量",
                    description: "刷新 Cursor 使用量统计"
                },
            ];

            // 显示 QuickPick
            const selection = await vscode.window.showQuickPick(infoItems, {
                placeHolder: 'Cursor 信息',
                ignoreFocusOut: false // 失去焦点时自动关闭
            });

            if (selection) {
                await this.handleMenuSelection(selection);
            }

        } catch (error) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : '未知错误';
            vscode.window.showErrorMessage(`获取信息失败: ${errorMessage}`);
        }
    }

    private async handleMenuSelection(selection: vscode.QuickPickItem) {
        switch (selection.label) {
            case "$(sync) 刷新使用量":
                await this.showMenu(); // 重新显示菜单以刷新数据
                break;
        }
    }

    dispose() {
        this._statusBarItem.dispose();
    }
} 