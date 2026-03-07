import { CustomContext } from '../context';
import { Markup } from 'telegraf';

export const helpCommand = async (ctx: CustomContext) => {
    try {
        const helpText =
            '<b>Dota Match Announcer Bot - Help</b> 🎮\n\n' +
            '<b>Available Commands:</b>\n\n' +
            '🔍 Search Teams - Search for Dota 2 teams to subscribe to\n' +
            '📋 My Teams - View your subscribed teams and manage subscriptions\n' +
            '🕐 Timezone - Change your timezone for match notifications\n' +
            '❓ Help - Show this help message\n\n' +
            '<b>How it works:</b>\n' +
            '1️⃣ Use the menu buttons or type /searchteam to find teams\n' +
            '2️⃣ Subscribe to teams to get notifications\n' +
            '3️⃣ You\'ll receive notifications 30 minutes before matches start\n' +
            '4️⃣ Manage your subscriptions with the My Teams button\n\n' +
            '<b>Need help?</b>\n' +
            'Just click the ❓ Help button anytime!';

        const keyboard = Markup.keyboard([
            ['🔍 Search Teams', '📋 My Teams'],
            ['🕐 Timezone', '❓ Help'],
        ]).resize().persistent();

        return await ctx.reply(helpText, { parse_mode: 'HTML', ...keyboard });
    } catch (error) {
        console.error('Error in helpCommand:', error);
        try {
            return await ctx.reply('An error occurred while processing your request. Please try again.');
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }
};
