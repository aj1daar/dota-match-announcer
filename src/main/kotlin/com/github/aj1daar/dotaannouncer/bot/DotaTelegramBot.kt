package com.github.aj1daar.dotaannouncer.bot

import com.github.aj1daar.dotaannouncer.model.Subscriber
import com.github.aj1daar.dotaannouncer.repository.SubscriberRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.telegram.telegrambots.bots.TelegramLongPollingBot
import org.telegram.telegrambots.meta.api.methods.send.SendMessage
import org.telegram.telegrambots.meta.api.objects.Update
import java.time.LocalDateTime

@Component
class DotaTelegramBot(
    @Value("\${telegram.bot-token}")
    private val token: String,

    @Value("\${telegram.bot-username}")
    private val botName: String,
    private val subscriberRepository: SubscriberRepository
) : TelegramLongPollingBot(token) {

    override fun getBotUsername(): String = botName

    override fun onUpdateReceived(update: Update) {
        if (update.hasMessage() && update.message.hasText()) {
            val chatId = update.message.chatId
            val text = update.message.text
            val firstName = update.message.from.firstName;

            if (text == "/start") {

                saveSubscriber(chatId, firstName)

                sendNotification(chatId, "👋 Welcome $firstName! You are now subscribed to Dota 2 match updates.")
            }
        }
    }

    private fun saveSubscriber(chatId: Long, name: String) {
        if (!subscriberRepository.existsById(chatId)) {
            val sub = Subscriber(chatId, name, LocalDateTime.now())
            subscriberRepository.save(sub)
            println("✅ New subscriber registered: $name ($chatId)")
        }
    }

    fun sendNotification(chatId: Long, text: String) {
        val message = SendMessage(chatId.toString(), text)
        execute(message)
    }
}