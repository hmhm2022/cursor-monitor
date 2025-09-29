export interface UsageData {
    premium_usage: number;
    max_premium_usage: number;
    basic_usage: number;
    max_basic_usage: number;
}

export interface Auth0UserInfo {
    email: string;
    email_verified: boolean;
    name: string;
    sub: string;
    updated_at: string;
}

export interface StripeProfile {
    membershipType: string;
    daysRemainingOnTrial: number;
}

export interface DbRow {
    value: string;
}

export interface ApiError {
    response?: {
        status: number;
        data: any;
    };
    message?: string;
}

// 新增的类型定义，用于支持详细使用事件
export interface UsageEvent {
    kind: string;
    model: string;
    timestamp: number;
    requestsCosts: number;
    tokenUsage: {
        inputTokens: number;
        outputTokens: number;
        cacheWriteTokens: number;
        cacheReadTokens: number;
        totalCents: number;
    };
    customSubscriptionName?: string;
}

export interface FilteredUsageEventsResponse {
    usageEventsDisplay: UsageEvent[];
    totalUsageEventsCount: number;
}

export interface DetailedUsageStats {
    modelName: string;
    count: number;
    totalCost: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
}

export interface EnhancedUsageData extends UsageData {
    detailedStats?: DetailedUsageStats[];
    totalCost?: number;
    totalSaved?: number;
    eventsCount?: number;
}