package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot
import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import com.github.aj1daar.dotaannouncer.model.TeamSubscription
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component
import org.telegram.telegrambots.meta.api.methods.send.SendMessage
import org.telegram.telegrambots.meta.api.objects.replykeyboard.InlineKeyboardMarkup
import org.telegram.telegrambots.meta.api.objects.replykeyboard.buttons.InlineKeyboardButton

@Component
class MyTeamsCommandHandler(
    private val teamSubscriptionRepository: TeamSubscriptionRepository,
    private val notificationService: ObjectProvider<NotificationService>,
    private val bot: ObjectProvider<DotaTelegramBot>
) : CommandHandler {
    override fun canHandle(command: String): Boolean {
        return command == "/my_teams" || command == "/myteams"
    }

    override fun handle(chatId: Long, command: String) {
        val subscriptions = teamSubscriptionRepository.findBySubscriberChatId(chatId)

        if (subscriptions.isEmpty()) {
            notificationService.getObject().sendNotification(
                chatId,
                "📋 You are not following any teams yet.\n\nUse /search_team <name> to find and follow teams."
            )
            return
        }

        val teamsList = buildTeamsList(subscriptions)
        val messageText = """📋 Your Subscribed Teams:

$teamsList

Total: ${subscriptions.size} team(s)

Click a button below to unfollow a team:"""

        val rows = subscriptions.map { sub ->
            val teamName = (sub as Any).javaClass.getMethod("getTeamName").invoke(sub) as String
            val teamId = (sub as Any).javaClass.getMethod("getTeamId").invoke(sub) as Long
            val button = InlineKeyboardButton().apply {
                text = "❌ Unfollow: $teamName"
                // Keep callback data short to avoid Telegram 64-byte limit
                callbackData = "UNSUB_TEAM:$teamId"
            }
            listOf(button)
        }

        val markup = InlineKeyboardMarkup().apply { keyboard = rows }
        val message = SendMessage(chatId.toString(), messageText).apply {
            replyMarkup = markup
        }

        bot.getObject().execute(message)
    }

    private fun buildTeamsList(subscriptions: List<TeamSubscription>): String {
        return subscriptions.mapIndexed { index, sub ->
            val teamName = (sub as Any).javaClass.getMethod("getTeamName").invoke(sub) as String
            "${index + 1}. $teamName"
        }.joinToString("\n")
    }
}
