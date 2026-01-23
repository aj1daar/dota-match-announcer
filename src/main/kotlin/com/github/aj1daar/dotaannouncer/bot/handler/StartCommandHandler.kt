package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.DotaTelegramBot
import com.github.aj1daar.dotaannouncer.model.Subscriber
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository
import org.springframework.stereotype.Component
import java.time.LocalDateTime

@Component
class StartCommandHandler(
    private val subscriberRepository: SubscriberRepository,
    private val bot: DotaTelegramBot
) : CommandHandler {
    override fun canHandle(command: String): Boolean {
        return command == "/start"
    }

    override fun handle(chatId: Long, command: String) {
        val firstName = "User" // This will be passed from the bot
        saveSubscriber(chatId, firstName)
        bot.sendNotification(chatId, "👋 Welcome $firstName! Use /search team <name> to follow a team.")
    }

    private fun saveSubscriber(chatId: Long, name: String) {
        if (!subscriberRepository.existsById(chatId)) {
            val sub = Subscriber(chatId, name, LocalDateTime.now())
            subscriberRepository.save(sub)
            println("✅ New subscriber registered: $name ($chatId)")
        }
    }

    @Suppress("UNUSED")
    fun handleWithName(chatId: Long, firstName: String) {
        saveSubscriber(chatId, firstName)
        bot.sendNotification(chatId, "👋 Welcome $firstName! Use /search team <name> to follow a team.")
    }
}