package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot
import com.github.aj1daar.dotaannouncer.bot.service.MessageCleanupService
import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Lazy
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import org.telegram.telegrambots.meta.api.methods.updatingmessages.DeleteMessage
import org.telegram.telegrambots.meta.api.objects.Update

@Component
class UnsubscribeTeamCallbackHandler(
    private val teamSubscriptionRepository: TeamSubscriptionRepository,
    @Lazy private val notificationService: NotificationService,
    private val messageCleanupService: MessageCleanupService,
    private val bot: ObjectProvider<DotaTelegramBot>
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

        // Fetch team name before deletion
        val subscription = teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(chatId, teamId)
        val teamName = subscription.map { sub ->
            (sub as Any).javaClass.getMethod("getTeamName").invoke(sub) as String
        }.orElse("Unknown Team")

        val deleted = teamSubscriptionRepository
            .deleteBySubscriberChatIdAndTeamId(chatId, teamId)

        if (deleted > 0) {
            // Delete the subscribed teams message
            val lastMessageId = messageCleanupService.getLastMessageId(chatId)
            if (lastMessageId != null) {
                try {
                    bot.getObject().execute(DeleteMessage(chatId.toString(), lastMessageId))
                    messageCleanupService.clearLastMessageId(chatId)
                } catch (e: Exception) {
                    // Ignore if message deletion fails (already deleted, etc.)
                }
            }

            notificationService.sendNotification(chatId, "✅ You have unfollowed $teamName!")
        } else {
            notificationService.sendNotification(chatId, "❌ Subscription not found.")
        }
    }
}
