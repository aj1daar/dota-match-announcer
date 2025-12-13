package com.github.aj1daar.dotaannouncer.bot

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.telegram.telegrambots.bots.TelegramLongPollingBot
import org.telegram.telegrambots.meta.api.methods.send.SendMessage
import org.telegram.telegrambots.meta.api.objects.Update

@Component
class DotaTelegramBot(
    @Value("\${telegram.bot-token}")
    private val token: String,

    @Value("\${telegram.bot-username}")
    private val botName: String
) : TelegramLongPollingBot(token) {

    override fun getBotUsername(): String = botName

    override fun onUpdateReceived(update: Update) {
        if (update.hasMessage() && update.message.hasText()) {
            val chatId = update.message.chatId
            val text = update.message.text

            if (text == "/start") {
                sendNotification(chatId, "👋 Hello! I am the Dota 2 Announcer.\nI will notify you when matches are created!")
            }
        }
    }

    fun sendNotification(chatId: Long, text: String) {
        val message = SendMessage(chatId.toString(), text)
        execute(message)
    }
}