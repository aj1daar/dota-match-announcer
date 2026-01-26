package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component
import org.telegram.telegrambots.meta.api.objects.Update

@Component
class MainMenuCallbackHandler(
    private val notificationService: ObjectProvider<NotificationService>,
    private val keyboardService: com.github.aj1daar.dotaannouncer.bot.service.KeyboardService
) : CallbackQueryHandler {

    override fun canHandle(callbackData: String): Boolean {
        return callbackData == "MAIN_MENU"
    }

    override fun handle(chatId: Long, callbackData: String, update: Update) {
        val keyboard = keyboardService.createMainMenuKeyboard()
        val firstName = update.callbackQuery.from.firstName
        notificationService.getObject().sendNotificationWithKeyboard(
            chatId,
            "🏠 Main Menu\n\nWelcome back, $firstName! Choose an option below:",
            keyboard
        )
    }
}
