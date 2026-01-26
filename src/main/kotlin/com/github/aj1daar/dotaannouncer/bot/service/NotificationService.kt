package com.github.aj1daar.dotaannouncer.bot.service

import org.telegram.telegrambots.meta.api.objects.replykeyboard.ReplyKeyboard

interface NotificationService {
    fun sendNotification(chatId: Long, text: String)
    fun sendNotificationWithKeyboard(chatId: Long, text: String, keyboard: ReplyKeyboard)
}
