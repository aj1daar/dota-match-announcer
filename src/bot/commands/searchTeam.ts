import { CustomContext } from '../context';
import { PandaScoreClient, Team } from '../../pandascore';
import { InlineKeyboardButton } from 'telegraf/types';
import { Message } from 'telegraf/types';

export const searchTeamCommand = async (ctx: CustomContext) => {
    if (!ctx.message || !('text' in ctx.message)) {
        return ctx.reply('Please provide a team name to search for. Example: `/searchteam OG`');
    }

    const teamName = (ctx.message as Message.TextMessage).text.split(' ').slice(1).join(' ');

    if (!teamName) {
        return ctx.reply(
            'Please provide a team name to search for. Example: `/searchteam OG`',
        );
    }

    const pandaScoreClient = new PandaScoreClient(ctx.env);
    const teams = await pandaScoreClient.searchTeams(teamName);

    if (teams.length === 0) {
        return ctx.reply(`No teams found for "${teamName}".`);
    }

    const keyboardButtons: InlineKeyboardButton[][] = teams.map((team: Team) => [
        {
            text: team.name,
            callback_data: `subscribe_team:${team.id}:${team.name}`,
        },
    ]);

    return ctx.reply('Select a team to subscribe to:', {
        reply_markup: {
            inline_keyboard: keyboardButtons,
        },
    });
};
