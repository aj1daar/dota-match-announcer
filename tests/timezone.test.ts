import {
    detectTimezoneFromRequest,
    isValidTimezone,
    formatMatchTime,
    getTimezoneAbbreviation,
} from '../src/utils/timezone';

describe('Timezone Utilities', () => {
    describe('detectTimezoneFromRequest', () => {
        it('should detect timezone from Cloudflare request', () => {
            const mockRequest = {
                cf: {
                    timezone: 'America/New_York',
                },
            } as any;

            const result = detectTimezoneFromRequest(mockRequest);
            expect(result).toBe('America/New_York');
        });

        it('should fallback to UTC if timezone not available', () => {
            const mockRequest = {} as any;
            const result = detectTimezoneFromRequest(mockRequest);
            expect(result).toBe('UTC');
        });

        it('should fallback to UTC if timezone is invalid', () => {
            const mockRequest = {
                cf: {
                    timezone: 'Invalid/Timezone',
                },
            } as any;

            const result = detectTimezoneFromRequest(mockRequest);
            expect(result).toBe('UTC');
        });
    });

    describe('isValidTimezone', () => {
        it('should validate correct IANA timezones', () => {
            expect(isValidTimezone('America/New_York')).toBe(true);
            expect(isValidTimezone('Europe/London')).toBe(true);
            expect(isValidTimezone('Asia/Tokyo')).toBe(true);
            expect(isValidTimezone('UTC')).toBe(true);
        });

        it('should reject invalid timezones', () => {
            expect(isValidTimezone('Invalid/Timezone')).toBe(false);
            expect(isValidTimezone('NotATimezone')).toBe(false);
            expect(isValidTimezone('')).toBe(false);
        });
    });

    describe('formatMatchTime', () => {
        it('should format UTC date string in user timezone', () => {
            const utcDate = '2025-06-15T15:00:00Z';
            const formatted = formatMatchTime(utcDate, 'America/New_York');

            expect(formatted).toContain('Jun');
            expect(formatted).toContain('15');
        });

        it('should handle DST correctly - summer time', () => {
            const summerDate = '2025-06-15T15:00:00Z';
            const formatted = formatMatchTime(summerDate, 'America/New_York');

            expect(formatted).toContain('11:00');
        });

        it('should handle DST correctly - winter time', () => {
            const winterDate = '2025-12-15T15:00:00Z';
            const formatted = formatMatchTime(winterDate, 'America/New_York');

            expect(formatted).toContain('10:00');
        });

        it('should fallback gracefully for invalid dates', () => {
            const invalidDate = 'not-a-date';
            const result = formatMatchTime(invalidDate, 'UTC');
            expect(result).toBeDefined();
        });
    });

    describe('getTimezoneAbbreviation', () => {
        it('should get timezone abbreviation', () => {
            const date = new Date('2025-06-15T15:00:00Z');
            const abbr = getTimezoneAbbreviation(date, 'America/New_York');

            expect(abbr).toBeTruthy();
            expect(abbr).toContain('E');
        });

        it('should handle different timezones', () => {
            const date = new Date('2025-06-15T15:00:00Z');

            const nyAbbr = getTimezoneAbbreviation(date, 'America/New_York');
            const londonAbbr = getTimezoneAbbreviation(date, 'Europe/London');
            const tokyoAbbr = getTimezoneAbbreviation(date, 'Asia/Tokyo');

            expect(nyAbbr).toBeTruthy();
            expect(londonAbbr).toBeTruthy();
            expect(tokyoAbbr).toBeTruthy();
        });

        it('should return empty string for invalid timezone', () => {
            const date = new Date();
            const abbr = getTimezoneAbbreviation(date, 'Invalid/Timezone');

            expect(abbr).toBe('');
        });
    });
});
