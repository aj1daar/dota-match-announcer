package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot
import com.github.aj1daar.dotaannouncer.model.TeamSubscription
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository
import com.github.aj1daar.dotaannouncer.repository.TeamSubscriptionRepository
import org.springframework.stereotype.Component

@Component
@Suppress("UNUSED")
class CallbackHandler(
    private val subscriberRepository: SubscriberRepository,
    private val teamSubscriptionRepository: TeamSubscriptionRepository,
    private val bot: DotaTelegramBot
) {
    @Suppress("UNUSED")
    fun handleCallback(chatId: Long, data: String) {
        if (data.startsWith("SUB_TEAM:")) {
            handleTeamSubscription(chatId, data)
        }
    }

    private fun handleTeamSubscription(chatId: Long, data: String) {
        // Format: SUB_TEAM:1234:TeamName
        val parts = data.split(":")
        if (parts.size < 3) return

        val teamId = parts[1].toLong()
        val teamName = parts[2]

        val subscriber = subscriberRepository.findById(chatId).orElse(null)
        if (subscriber != null) {
            if (!teamSubscriptionRepository.existsBySubscriberChatIdAndTeamId(chatId, teamId)) {
                val subscription = TeamSubscription(teamId, teamName, subscriber)
                teamSubscriptionRepository.save(subscription)
                bot.sendNotification(chatId, "✅ You are now following **$teamName**!")
            } else {
                bot.sendNotification(chatId, "ℹ️ You are already following $teamName.")
            }
        }
    }
}