package com.github.aj1daar.dotaannouncer.bot

import com.github.aj1daar.dotaannouncer.bot.handler.CallbackHandler
import com.github.aj1daar.dotaannouncer.bot.handler.CommandHandler
import com.github.aj1daar.dotaannouncer.bot.handler.HelpCommandHandler
import com.github.aj1daar.dotaannouncer.bot.handler.SearchTeamCommandHandler
import com.github.aj1daar.dotaannouncer.bot.handler.StartCommandHandler
import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
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
    private val botName: String,

    private val startCommandHandler: StartCommandHandler,
    helpCommandHandler: HelpCommandHandler,
    searchTeamCommandHandler: SearchTeamCommandHandler,
    private val callbackHandler: CallbackHandler
) : TelegramLongPollingBot(token), NotificationService {

    private val commandHandlers: List<CommandHandler> = listOf(
        startCommandHandler,
        helpCommandHandler,
        searchTeamCommandHandler
    )

    override fun getBotUsername(): String = botName

    override fun onUpdateReceived(update: Update) {
        if (update.hasMessage() && update.message.hasText()) {
            val chatId = update.message.chatId
            val text = update.message.text
            val firstName = update.message.from.firstName

            if (text == "/start") {
                startCommandHandler.handleWithName(chatId, firstName)
                return
            }

            for (handler in commandHandlers) {
                if (handler.canHandle(text)) {
                    handler.handle(chatId, text)
                    return
                }
            }
            
            sendNotification(chatId, "❓ Unknown command. Use /help for more commands.")
        }

        if (update.hasCallbackQuery()) {
            val callback = update.callbackQuery
            val data = callback.data
            val chatId = callback.message.chatId
            callbackHandler.handleCallback(chatId, data)
        }
    }

    override fun sendNotification(chatId: Long, text: String) {
        val message = SendMessage(chatId.toString(), text)
        execute(message)
    }
}