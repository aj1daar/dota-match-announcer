package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.telegram.telegrambots.meta.api.objects.Update
import org.springframework.context.annotation.Lazy

@Component
class UnsubscribeTeamCallbackHandler(
    private val teamSubscriptionRepository: TeamSubscriptionRepository,
    @Lazy private val notificationService: NotificationService
) : CallbackQueryHandler {

    override fun canHandle(callbackData: String): Boolean =
        callbackData.startsWith("UNSUB_TEAM:")

    @Transactional
    override fun handle(chatId: Long, callbackData: String, update: Update) {
        val teamId = callbackData.substringAfter("UNSUB_TEAM:").toLongOrNull()
        if (teamId == null) {
            notificationService.sendNotification(chatId, "❌ Invalid team id.")
            return
        }

        val deleted = teamSubscriptionRepository
            .deleteBySubscriberChatIdAndTeamId(chatId, teamId)

        if (deleted > 0) {
            notificationService.sendNotification(chatId, "✅ Team unfollowed successfully.")
        } else {
            notificationService.sendNotification(chatId, "❌ Subscription not found.")
        }
    }
}
