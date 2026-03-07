
export function detectTimezoneFromRequest(request: Request): string {
    try {
        const cf = (request as any).cf;
        if (cf && cf.timezone) {
            const detectedTz = cf.timezone;
            if (isValidTimezone(detectedTz)) {
                return detectedTz;
            }
        }
    } catch (error) {
        console.error('Error detecting timezone:', error);
    }
    return 'UTC';
}

export function isValidTimezone(tz: string): boolean {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

export function formatMatchTime(utcDateString: string, userTimezone: string): string {
    try {
        const date = new Date(utcDateString);
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        });

        return formatter.format(date);
    } catch (error) {
        console.error('Error formatting date:', error);
        return utcDateString;
    }
}

export function getTimezoneAbbreviation(date: Date, timezone: string): string {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            timeZoneName: 'short',
        });

        const parts = formatter.formatToParts(date);
        const tzPart = parts.find((part) => part.type === 'timeZoneName');
        return tzPart?.value || '';
    } catch (error) {
        console.error('Error getting timezone abbreviation:', error);
        return '';
    }
}

export const TIMEZONE_REGIONS = [
    {
        name: 'Americas (West)',
        timezones: [
            { name: 'Pacific Time (US)', value: 'America/Los_Angeles' },
            { name: 'Mountain Time (US)', value: 'America/Denver' },
            { name: 'Central Time (US)', value: 'America/Chicago' },
        ],
    },
    {
        name: 'Americas (East)',
        timezones: [
            { name: 'Eastern Time (US)', value: 'America/New_York' },
            { name: 'Toronto', value: 'America/Toronto' },
            { name: 'São Paulo', value: 'America/Sao_Paulo' },
            { name: 'Buenos Aires', value: 'America/Argentina/Buenos_Aires' },
        ],
    },
    {
        name: 'Europe',
        timezones: [
            { name: 'London', value: 'Europe/London' },
            { name: 'Paris/Berlin', value: 'Europe/Paris' },
            { name: 'Moscow', value: 'Europe/Moscow' },
            { name: 'Istanbul', value: 'Europe/Istanbul' },
        ],
    },
    {
        name: 'Asia',
        timezones: [
            { name: 'Dubai', value: 'Asia/Dubai' },
            { name: 'Tashkent', value: 'Asia/Tashkent' },
            { name: 'Almaty', value: 'Asia/Almaty' },
            { name: 'Bangkok', value: 'Asia/Bangkok' },
            { name: 'Shanghai/Beijing', value: 'Asia/Shanghai' },
            { name: 'Singapore', value: 'Asia/Singapore' },
        ],
    },
    {
        name: 'Pacific',
        timezones: [
            { name: 'Tokyo', value: 'Asia/Tokyo' },
            { name: 'Seoul', value: 'Asia/Seoul' },
            { name: 'Sydney', value: 'Australia/Sydney' },
            { name: 'Auckland', value: 'Pacific/Auckland' },
        ],
    },
];
