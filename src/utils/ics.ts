function escapeIcsText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

function formatIcsDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export interface IcsEvent {
    uid: string;
    summary: string;
    description: string;
    start: Date;
    durationMinutes: number;
    // Set (and raise) when re-issuing an event, so calendars treat it as an update to the one they already have.
    sequence?: number;
}

export function buildIcsCalendar(event: IcsEvent): string {
    const end = new Date(event.start.getTime() + event.durationMinutes * 60000);

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Dota Match Announcer//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${event.uid}`,
        `DTSTAMP:${formatIcsDate(new Date())}`,
        ...(event.sequence === undefined ? [] : [`SEQUENCE:${event.sequence}`]),
        `DTSTART:${formatIcsDate(event.start)}`,
        `DTEND:${formatIcsDate(end)}`,
        `SUMMARY:${escapeIcsText(event.summary)}`,
        `DESCRIPTION:${escapeIcsText(event.description)}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
}
