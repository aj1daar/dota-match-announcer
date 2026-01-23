package com.github.aj1daar.dotaannouncer.bot.service

interface NotificationService {
    fun sendNotification(chatId: Long, text: String)
}
