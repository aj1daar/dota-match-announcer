package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import com.github.aj1daar.dotaannouncer.model.TeamSubscription
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component

@Component
class MyTeamsCommandHandler(
    private val teamSubscriptionRepository: TeamSubscriptionRepository,
    private val notificationService: ObjectProvider<NotificationService>
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

        val message = """
            📋 Your Subscribed Teams:
            
            $teamsList
            
            Total: ${subscriptions.size} team(s)
        """.trimIndent()

        notificationService.getObject().sendNotification(chatId, message)
    }

    private fun buildTeamsList(subscriptions: List<TeamSubscription>): String {
        return subscriptions.mapIndexed { index, sub ->
            // Use Java method calls to access Lombok-generated getters
            val teamName = (sub as Any).javaClass.getMethod("getTeamName").invoke(sub) as String
            val teamId = (sub as Any).javaClass.getMethod("getTeamId").invoke(sub) as Long
            "${index + 1}. $teamName (ID: $teamId)"
        }.joinToString("\n")
    }
}
