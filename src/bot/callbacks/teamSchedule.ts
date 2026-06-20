import { CustomContext } from '../context';
import { isDataCallbackQuery } from '../utils';
import { PandaScoreClient } from '../../pandascore';
import { getDb } from '../../db/utils';
import { formatMatchTime, getTimezoneAbbreviation } from '../../utils/timezone';

const MAX_SCHEDULE_MATCHES = 5;

export const teamScheduleCallback = async (ctx: CustomContext) => {
    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
        return ctx.answerCbQuery('Something went wrong.');
    }

    const parts = ctx.callbackQuery.data.split(':');
    if (parts.length < 3 || parts[0] !== 'team_schedule') {
        return ctx.answerCbQuery('Invalid callback data.');
    }

    const teamId = parseInt(parts[1], 10);
    const teamName = parts.slice(2).join(':');
    const telegramId = ctx.from?.id;

    if (!telegramId || isNaN(teamId)) {
        return ctx.answerCbQuery('Could not identify your Telegram ID.');
    }

    await ctx.answerCbQuery();

    try {
        const db = getDb(ctx.env);
        const subscriber = await db.getSubscriberByTelegramId(telegramId);
        const userTimezone = subscriber?.timezone || 'UTC';

        const pandaScoreClient = new PandaScoreClient(ctx.env);
        const matches = await pandaScoreClient.getUpcomingMatches([teamId]);

        if (matches.length === 0) {
            return ctx.reply(`No upcoming matches found for <b>${teamName}</b>.`, { parse_mode: 'HTML' });
        }

        const upcoming = matches.slice(0, MAX_SCHEDULE_MATCHES);
        const lines: string[] = [`📅 <b>Upcoming matches for ${teamName}:</b>`];

        for (const match of upcoming) {
            const opp1 = match.opponents[0]?.opponent.name || 'TBD';
            const opp2 = match.opponents[1]?.opponent.name || 'TBD';
            const matchDate = new Date(match.begin_at);
            const formattedTime = formatMatchTime(match.begin_at, userTimezone);
            const tzAbbr = getTimezoneAbbreviation(matchDate, userTimezone);
            const boInfo = match.number_of_games ? ` · BO${match.number_of_games}` : '';

            lines.push(
                `\n<b>${opp1} vs ${opp2}</b>\n` +
                `🗓 ${formattedTime} ${tzAbbr}${boInfo}\n` +
                `🏆 ${match.league.name} - ${match.serie.full_name}`,
            );
        }

        return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error fetching team schedule:', error);
        return ctx.reply('Failed to fetch schedule. Please try again.');
    }
};
