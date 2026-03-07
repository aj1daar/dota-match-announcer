import { CustomContext } from '../context';

export const helpCommand = async (ctx: CustomContext) => {
    try {
        const helpText =
            '<b>Dota Match Announcer Bot - Help</b> 🎮\n\n' +
            '<b>Available Commands:</b>\n\n' +
            '/start - Register with the bot and set up your account\n' +
            '/help - Show this help message\n' +
            '/searchteam - Search for Dota 2 teams to subscribe to\n' +
            '/myteams - View your subscribed teams and manage subscriptions\n' +
            '/timezone - Change your timezone for match notifications\n\n' +
            '<b>How it works:</b>\n' +
            '1️⃣ Use /searchteam to find teams you want to follow\n' +
            '2️⃣ Subscribe to teams to get notifications\n' +
            '3️⃣ You\'ll receive notifications 30 minutes before matches start\n' +
            '4️⃣ Manage your subscriptions with /myteams\n\n' +
            '<b>Need help?</b>\n' +
            'Just type /help anytime to see this message again!';

        return await ctx.reply(helpText, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error in helpCommand:', error);
        try {
            return await ctx.reply('An error occurred while processing your request. Please try again.');
        } catch (replyError) {
            console.error('Failed to send error message:', replyError);
        }
    }
};
