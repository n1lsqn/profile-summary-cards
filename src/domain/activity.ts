export interface ActivityPoint {
    occurredAt: string;
    hourUtc: number;
    count: number;
    source: 'github' | 'gitlab';
}

export interface DailyContribution {
    date: string;
    count: number;
    source: 'github' | 'gitlab';
}
