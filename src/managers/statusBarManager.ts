
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
        this._statusBarItem.command = 'cursor-monitor.showMenu';
    }

    init() {
        this._statusBarItem.text = "$(rocket) Cursor Monitor";
        this._statusBarItem.tooltip = "点击查看 Cursor 使用情况";
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
            // 首先检查数据库文件是否存在
            const dbCheck = await this.usageManager.checkDbExists();
            if (!dbCheck.exists) {
                // 数据库文件检查失败会在 getCurrentToken 方法中处理
                // 我们这里只需直接调用并让它处理错误
                await this.usageManager.getCurrentToken();
                return; // 如果数据库不存在，在 getCurrentToken 中已经显示了错误信息，直接返回
            }
            
            // 获取最新数据
            const token = await this.usageManager.getCurrentToken();
            if (!token) {
                vscode.window.showWarningMessage('未找到有效的 token，请先确保已登录 Cursor');
                return;
            }

            // 显示加载提示
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在获取 Cursor 使用数据...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0 });

                // 并行获取所有数据
                const [usage, accountInfo, subscriptionInfo, eventsData] = await Promise.all([
                    this.usageManager.getUsage(token),
                    this.usageManager.getAuth0UserInfo(token),
                    this.usageManager.getStripeProfile(token),
                    this.usageManager.getFilteredUsageEvents(token).catch(() => null) // 如果新接口失败，不影响显示
                ]);

                progress.report({ increment: 100 });

                // 获取当前配置
                const config = vscode.workspace.getConfiguration('cursorMonitor');
                const useCursorNightly = config.get<boolean>('useCursorNightly', false);

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
                        label: "=== 使用量统计 ===",
                        kind: vscode.QuickPickItemKind.Separator
                    },
                    {
                        label: `Premium 模型：${usage.premium_usage || 0}/${usage.max_premium_usage === 999999 ? '无限' : usage.max_premium_usage}`
                    },
                    {
                        label: `Basic 模型：${usage.basic_usage || 0}/${usage.max_basic_usage === 999999 ? '无限' : usage.max_basic_usage}`
                    }
                ];

                // 如果成功获取了详细事件数据，添加更多统计信息
                if (eventsData && eventsData.usageEventsDisplay) {
                    const events = eventsData.usageEventsDisplay;
                    const totalEvents = eventsData.totalUsageEventsCount || events.length;
                    
                    // 计算总成本
                    let totalCost = 0;
                    let totalSaved = 0;
                    
                    for (const event of events) {
                        const requestCost = event.requestsCosts || 0;
                        const actualCost = (event.tokenUsage?.totalCents || 0) / 100;
                        totalCost += actualCost;
                        totalSaved += requestCost - actualCost;
                    }

                    infoItems.push(
                        {
                            label: "=== 详细统计 ===",
                            kind: vscode.QuickPickItemKind.Separator
                        },
                        {
                            label: `总请求数：${totalEvents}`
                        },
                        {
                            label: `实际花费：$${totalCost.toFixed(2)}`
                        },
                        {
                            label: `节省金额：$${totalSaved.toFixed(2)}`
                        }
                    );
                }

                infoItems.push(
                    {
                        label: "=== 操作 ===",
                        kind: vscode.QuickPickItemKind.Separator
                    },
                    {
                        label: "$(sync) 刷新使用量",
                        description: "刷新 Cursor 使用量统计"
                    },
                    {
                        label: "$(graph) 查看详细统计",
                        description: "查看按模型分类的详细使用统计"
                    },
                    {
                        label: useCursorNightly ? "$(arrow-swap) 切换到 Cursor 正式版" : "$(arrow-swap) 切换到 Cursor Nightly",
                        description: useCursorNightly ? "当前使用 Cursor Nightly 版本" : "当前使用 Cursor 正式版"
                    }
                );

                // 显示 QuickPick
                const selection = await vscode.window.showQuickPick(infoItems, {
                    placeHolder: 'Cursor 信息',
                    ignoreFocusOut: false // 失去焦点时自动关闭
                });

                if (selection) {
                    await this.handleMenuSelection(selection, token);
                }
            });

        } catch (error) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : '未知错误';
            vscode.window.showErrorMessage(`获取信息失败: ${errorMessage}`);
        }
    }

    private async showDetailedStats(token: string) {
        try {
            const eventsData = await this.usageManager.getFilteredUsageEvents(token);
            
            if (!eventsData || !eventsData.usageEventsDisplay) {
                vscode.window.showWarningMessage('无法获取详细统计数据');
                return;
            }

            const events = eventsData.usageEventsDisplay;
            
            // 按模型分组统计
            const modelStats = new Map<string, any>();
            
            for (const event of events) {
                const model = event.model || 'unknown';
                if (!modelStats.has(model)) {
                    modelStats.set(model, {
                        count: 0,
                        totalCost: 0,
                        inputTokens: 0,
                        outputTokens: 0
                    });
                }
                
                const stats = modelStats.get(model);
                stats.count++;
                stats.totalCost += (event.tokenUsage?.totalCents || 0) / 100;
                stats.inputTokens += event.tokenUsage?.inputTokens || 0;
                stats.outputTokens += event.tokenUsage?.outputTokens || 0;
            }

            // 创建详细统计显示项
            const detailItems: vscode.QuickPickItem[] = [
                {
                    label: "=== 按模型分类统计 ===",
                    kind: vscode.QuickPickItemKind.Separator
                }
            ];

            // 按使用次数排序
            const sortedModels = Array.from(modelStats.entries())
                .sort((a, b) => b[1].count - a[1].count);

            for (const [model, stats] of sortedModels) {
                detailItems.push({
                    label: `${model}`,
                    description: `${stats.count} 次请求`,
                    detail: `💰 $${stats.totalCost.toFixed(4)} | 📥 ${stats.inputTokens.toLocaleString()} | 📤 ${stats.outputTokens.toLocaleString()}`
                });
            }

            detailItems.push(
                {
                    label: "=== 操作 ===",
                    kind: vscode.QuickPickItemKind.Separator
                },
                {
                    label: "$(arrow-left) 返回主菜单",
                    description: "返回到主菜单"
                }
            );

            const selection = await vscode.window.showQuickPick(detailItems, {
                placeHolder: '详细统计信息',
                ignoreFocusOut: false
            });

            if (selection?.label === "$(arrow-left) 返回主菜单") {
                await this.showMenu();
            }

        } catch (error) {
            const errorMessage = error instanceof Error 
                ? error.message 
                : '未知错误';
            vscode.window.showErrorMessage(`获取详细统计失败: ${errorMessage}`);
        }
    }

    private async handleMenuSelection(selection: vscode.QuickPickItem, token?: string) {
        switch (selection.label) {
            case "$(sync) 刷新使用量":
                await this.showMenu(); // 重新显示菜单以刷新数据
                break;
            case "$(graph) 查看详细统计":
                if (token) {
                    await this.showDetailedStats(token);
                }
                break;
            case "$(arrow-swap) 切换到 Cursor Nightly":
                await this.toggleCursorVersion(true);
                break;
            case "$(arrow-swap) 切换到 Cursor 正式版":
                await this.toggleCursorVersion(false);
                break;
        }
    }

    private async toggleCursorVersion(useNightly: boolean) {
        // 更新配置
        await vscode.workspace.getConfiguration('cursorMonitor').update('useCursorNightly', useNightly, true);
        
        // 显示通知
        vscode.window.showInformationMessage(
            useNightly ? '已切换到 Cursor Nightly 版本' : '已切换到 Cursor 正式版'
        );
        
        // 重新显示菜单
        await this.showMenu();
    }

    dispose() {
        this._statusBarItem.dispose();
    }
}
