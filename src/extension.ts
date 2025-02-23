import * as vscode from 'vscode';
// import { TokenManager } from './managers/tokenManager';
import { UsageManager } from './managers/usageManager';
import { StatusBarManager } from './managers/statusBarManager';

export function activate(context: vscode.ExtensionContext) {
    try {
        // const tokenManager = new TokenManager(context);
        const usageManager = new UsageManager();
        
        // 创建状态栏管理器
        const statusBarManager = new StatusBarManager(usageManager);

        // 初始化状态栏
        statusBarManager.init();

        // 注册悬浮菜单命令
        context.subscriptions.push(
            vscode.commands.registerCommand('crazy-cursor.showMenu', async () => {
                try {
                    await statusBarManager.showMenu();
                } catch (error) {
                    const errorMessage = error instanceof Error 
                        ? error.message 
                        : '未知错误';
                    vscode.window.showErrorMessage(`菜单显示失败: ${errorMessage}`);
                }
            })
        );

        // 注册清理函数
        context.subscriptions.push(statusBarManager);
    } catch (error) {
        const errorMessage = error instanceof Error 
            ? error.message 
            : '未知错误';
        vscode.window.showErrorMessage(`扩展激活失败: ${errorMessage}`);
    }
}

export function deactivate() {} 