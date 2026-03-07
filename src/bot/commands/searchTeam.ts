import { CustomContext } from '../context';
import { Message } from 'telegraf/types';
import { Markup } from 'telegraf';
import { performTeamSearch } from '../utils/performTeamSearch';

export const searchTeamCommand = async (ctx: CustomContext) => {
    try {
        if (!ctx.message || !('text' in ctx.message)) {
            return ctx.reply('Please provide a team name to search for. Example: `/searchteam OG`');
        }

        const teamName = (ctx.message as Message.TextMessage).text.split(' ').slice(1).join(' ');

        if (!teamName) {
            const keyboard = Markup.keyboard([
                ['🔍 Search Teams', '📋 My Teams'],
                ['🕐 Timezone', '❓ Help'],
            ]).resize().persistent();

            return ctx.reply(
                '🔍 *Team Search*\n\n' +
                'Please enter the team name you want to search for.\n\n' +
                'Example: Type `OG` or `Team Liquid`\n\n' +
                'I\'ll search for matching teams and show you the results!',
                { parse_mode: 'Markdown', ...keyboard }
            );
        }

        return performTeamSearch(ctx, teamName);
    } catch (error) {
        console.error('Error in searchTeamCommand:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return ctx.reply(`An error occurred while searching for teams. Please try again.\n\nError: ${errorMessage}`).catch(() => {
            console.error('Failed to send error message');
        });
    }
};
