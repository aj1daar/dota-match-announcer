package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import com.github.aj1daar.dotaannouncer.model.TeamSubscription
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component
import org.telegram.telegrambots.meta.api.objects.Update

@Component
@Suppress("UNUSED")
class CallbackHandler(
    private val subscriberRepository: SubscriberRepository,
    private val teamSubscriptionRepository: TeamSubscriptionRepository,
    private val notificationService: ObjectProvider<NotificationService>
) : CallbackQueryHandler {

    @Suppress("UNUSED")
    fun handleCallback(chatId: Long, data: String) {
        when {
            data.startsWith("SUB_TEAM:") -> handleTeamSubscription(chatId, data)
            data.startsWith("UNSUB_TEAM:") -> handleTeamUnsubscription(chatId, data)
            else -> {
                notificationService.getObject().sendNotification(chatId, "❓ Unknown callback received.")
            }
        }
    }

    override fun canHandle(callbackData: String): Boolean = callbackData.startsWith("SUB_TEAM:")

    override fun handle(chatId: Long, callbackData: String, update: Update) {
        handleTeamSubscription(chatId, callbackData)
    }

    private fun handleTeamSubscription(chatId: Long, data: String) {

        val parts = data.split(":")
        if (parts.size < 3) return

        val teamId = parts[1].toLong()
        val teamName = parts[2]

        val subscriber = subscriberRepository.findById(chatId).orElse(null)
        if (subscriber != null) {
            if (!teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(chatId, teamId)) {
                val subscription = TeamSubscription(teamId, teamName, subscriber)
                teamSubscriptionRepository.save(subscription)
                notificationService.getObject().sendNotification(chatId, "✅ You are now following $teamName!")
            } else {
                notificationService.getObject().sendNotification(chatId, "ℹ️ You are already following $teamName.")
            }
        }
    }

    private fun handleTeamUnsubscription(chatId: Long, data: String) {
        val parts = data.split(":")
        if (parts.size < 2) return

        val teamId = parts[1].toLongOrNull() ?: return

        val subscriptionOpt = teamSubscriptionRepository.findBySubscriberChatIdAndTeamId(chatId, teamId)
        if (subscriptionOpt.isPresent) {
            val subscription = subscriptionOpt.get()
            val teamName = (subscription as Any).javaClass.getMethod("getTeamName").invoke(subscription) as String
            teamSubscriptionRepository.deleteBySubscriberChatIdAndTeamId(chatId, teamId)
            notificationService.getObject().sendNotification(chatId, "✅ You have unfollowed $teamName!")
        } else {
            notificationService.getObject().sendNotification(chatId, "ℹ️ You are not following this team.")
        }
    }
}