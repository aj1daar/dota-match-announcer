package com.github.aj1daar.dotaannouncer.bot.handler

import org.telegram.telegrambots.meta.api.objects.Update


interface CallbackQueryHandler {

    fun canHandle(callbackData: String): Boolean
    fun handle(chatId: Long, callbackData: String, update: Update)
}