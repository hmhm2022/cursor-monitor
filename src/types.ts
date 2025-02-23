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