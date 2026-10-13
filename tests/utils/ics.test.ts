import { buildIcsCalendar } from '../../src/utils/ics';

describe('buildIcsCalendar', () => {
    it('builds a valid VEVENT block with escaped text and correct start/end', () => {
        const start = new Date('2026-03-01T18:00:00Z');
        const ics = buildIcsCalendar({
            uid: 'dota-match-123@dota-match-announcer',
            summary: 'Team A vs Team B, Finals',
            description: 'Best of 3',
            start,
            durationMinutes: 120,
        });

        expect(ics).toContain('BEGIN:VCALENDAR');
        expect(ics).toContain('BEGIN:VEVENT');
        expect(ics).toContain('UID:dota-match-123@dota-match-announcer');
        expect(ics).toContain('DTSTART:20260301T180000Z');
        expect(ics).toContain('DTEND:20260301T200000Z');
        expect(ics).toContain('SUMMARY:Team A vs Team B\\, Finals');
        expect(ics).toContain('DESCRIPTION:Best of 3');
        expect(ics).toContain('END:VEVENT');
        expect(ics).toContain('END:VCALENDAR');
        expect(ics.split('\n')[0].trim()).toEqual('BEGIN:VCALENDAR');
    });

    it('escapes commas, semicolons, backslashes, and newlines in text fields', () => {
        const ics = buildIcsCalendar({
            uid: 'x@y',
            summary: 'A; B, C\\D',
            description: 'line1\nline2',
            start: new Date('2026-01-01T00:00:00Z'),
            durationMinutes: 60,
        });

        expect(ics).toContain('SUMMARY:A\\; B\\, C\\\\D');
        expect(ics).toContain('DESCRIPTION:line1\\nline2');
    });

    it('adds a SEQUENCE only when re-issuing an event', () => {
        const event = {
            uid: 'match-1@test',
            summary: 'A vs B',
            description: 'Final',
            start: new Date('2030-01-01T12:00:00Z'),
            durationMinutes: 60,
        };

        expect(buildIcsCalendar(event)).not.toContain('SEQUENCE');
        expect(buildIcsCalendar({ ...event, sequence: 42 }).split('\r\n')).toContain('SEQUENCE:42');
    });
});
