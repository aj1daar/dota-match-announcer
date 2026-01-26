package com.github.aj1daar.dotaannouncer.bot

import com.github.aj1daar.dotaannouncer.bot.handler.CallbackQueryHandler
import com.github.aj1daar.dotaannouncer.bot.handler.CommandHandler
import com.github.aj1daar.dotaannouncer.bot.handler.HelpCommandHandler
import com.github.aj1daar.dotaannouncer.bot.handler.MyTeamsCommandHandler
import com.github.aj1daar.dotaannouncer.bot.handler.SearchTeamCommandHandler
import com.github.aj1daar.dotaannouncer.bot.handler.StartCommandHandler
import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import org.telegram.telegrambots.bots.TelegramLongPollingBot
import org.telegram.telegrambots.meta.api.methods.AnswerCallbackQuery
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
    myTeamsCommandHandler: MyTeamsCommandHandler,
    private val callbackHandlers: List<CallbackQueryHandler>
) : TelegramLongPollingBot(token), NotificationService {


    private val commandHandlers: List<CommandHandler> = listOf(
        startCommandHandler,
        helpCommandHandler,
        searchTeamCommandHandler,
        myTeamsCommandHandler
    )

    override fun getBotUsername(): String = botName

    override fun onUpdateReceived(update: Update) {
        if (update.hasMessage() && update.message.hasText()) {
            val chatId = update.message.chatId
            val text = update.message.text
            val firstName = update.message.from.firstName
            if (text == "/start") {
                startCommandHandler.handleWithName(chatId, firstName)
                return }
            for (handler in commandHandlers) {
                if (handler.canHandle(text)) {
                    handler.handle(chatId, text)
                    return }
            }
            sendNotification(chatId, "❓ Unknown command. Use /help for more commands.")
            return }

        if (update.hasCallbackQuery()) {
            val callbackQuery = update.callbackQuery
            val data = callbackQuery.data ?: return
            callbackHandlers.firstOrNull { it.canHandle(data) }
                ?.handle(callbackQuery.message.chatId, data, update)

            val teamName = data.substringAfterLast(":").ifBlank { "team" }
            execute(
                AnswerCallbackQuery().apply {
                    callbackQueryId = callbackQuery.id
                    text = "✅ Now following $teamName" // short (<200 chars)
                    showAlert = false }
            )
        }
    }

    override fun sendNotification(chatId: Long, text: String) {
        val message = SendMessage(chatId.toString(), text)
        execute(message)
    }

}