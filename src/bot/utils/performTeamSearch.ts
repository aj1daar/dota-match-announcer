import { CustomContext } from '../context';
import { PandaScoreClient, Team } from '../../pandascore';
import { InlineKeyboardButton } from 'telegraf/types';

export const performTeamSearch = async (ctx: CustomContext, teamName: string) => {
    try {
        console.log(`[performTeamSearch] User ${ctx.from?.id} searching for team: "${teamName}"`);

        const pandaScoreClient = new PandaScoreClient(ctx.env);
        const teams = await pandaScoreClient.searchTeams(teamName);

        if (teams.length === 0) {
            return ctx.reply(
                `No teams found for "${teamName}".\n\n` +
                'Try searching with a different name or check the spelling.'
            );
        }

        const keyboardButtons: InlineKeyboardButton[][] = teams.map((team: Team) => [
            {
                text: team.name,
                callback_data: `subscribe_team:${team.id}:${team.name}`,
            },
        ]);

        return ctx.reply(
            `Found ${teams.length} team(s) matching "${teamName}":\n\n` +
            'Select a team to subscribe to:',
            {
                reply_markup: {
                    inline_keyboard: keyboardButtons,
                },
            }
        );
    } catch (error) {
        console.error('Error in performTeamSearch:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return ctx.reply(
            'An error occurred while searching for teams. Please try again.\n\n' +
            `Error: ${errorMessage}`
        ).catch(() => {
            console.error('Failed to send error message');
        });
    }
};
